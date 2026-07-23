'use client'

import { format, useDict } from '@/lib/i18n/client'
import { Button, Stepper } from '@/components/ui'
import type { MemberView } from '../types'
import { formatChips } from './shared'

/**
 * 고스톱 승자 확정 점수 폼 — 기본 점수 스테퍼 + 공통 배수(흔들기·총통) +
 * 패자별 박(피박·광박) 토글.
 * 공통 배수는 제출 score 에 미리 곱해서 보내고(서버는 최종 점수만 받는다),
 * 박은 endRound loserPenalties(한 개 = 2배, 둘 다 = 4배)로 보낸다.
 * 상태는 부모(dealer-panel)가 소유한다 — 이 컴포넌트는 표시·토글만 담당.
 */

/** 서버 endRoundSchema 의 score 상한 — 배수 적용 후에도 넘지 않게 기본 점수를 조인다. */
const MAX_GOSTOP_SCORE = 999

/** 공통 배수 — 각 ×2, 둘 다 켜면 ×4. 게임 용어라 번역하지 않는다. */
const GOSTOP_MULTIPLIERS = [
  { id: 'heundeulgi', label: '흔들기' },
  { id: 'chongtong', label: '총통' },
] as const
type GostopMultiplierId = (typeof GOSTOP_MULTIPLIERS)[number]['id']

/** 패자별 박 — 각 ×2, 둘 다면 ×4 (endRound loserPenalties factor). */
const PENALTY_FLAGS = [
  { id: 'pibak', label: '피박' },
  { id: 'gwangbak', label: '광박' },
] as const
type PenaltyFlagId = (typeof PENALTY_FLAGS)[number]['id']

export interface GostopScoreState {
  readonly base: number
  readonly multipliers: readonly GostopMultiplierId[]
  /** 패자 userId → 켜진 박 플래그. 승자로 바뀐 멤버의 플래그는 제출 시 자연히 제외된다. */
  readonly penalties: Readonly<Record<string, readonly PenaltyFlagId[]>>
}

export const initialGostopScore: GostopScoreState = {
  base: 3,
  multipliers: [],
  penalties: {},
}

function commonFactor(state: GostopScoreState): number {
  return 2 ** state.multipliers.length
}

/** 제출용 최종 점수 — 기본 점수 × 공통 배수. */
export function gostopEffectiveScore(state: GostopScoreState): number {
  return state.base * commonFactor(state)
}

function penaltyFactorOf(flags: readonly PenaltyFlagId[]): 1 | 2 | 4 {
  if (flags.length >= 2) return 4
  return flags.length === 1 ? 2 : 1
}

/** endRound loserPenalties 페이로드 — 박 없는 패자는 목록에서 뺀다(서버 기본 1배). */
export function gostopLoserPenalties(
  state: GostopScoreState,
  loserIds: readonly string[],
): { userId: string; factor: 2 | 4 }[] {
  return loserIds.flatMap((userId) => {
    const factor = penaltyFactorOf(state.penalties[userId] ?? [])
    return factor === 1 ? [] : [{ userId, factor }]
  })
}

export function GostopScoreForm({
  state,
  onChange,
  losers,
  pointValue,
}: {
  state: GostopScoreState
  onChange: (next: GostopScoreState) => void
  /** 승자를 뺀 플레이어(관전 제외). 승자 선택 전에는 빈 배열. */
  losers: readonly MemberView[]
  pointValue: number
}) {
  const { d } = useDict()
  const factor = commonFactor(state)
  const total = gostopEffectiveScore(state)
  /** 박 없는 패자 1명이 내는 칩. */
  const perLoserPay = total * pointValue

  const toggleMultiplier = (id: GostopMultiplierId) => {
    const multipliers = state.multipliers.includes(id)
      ? state.multipliers.filter((item) => item !== id)
      : [...state.multipliers, id]
    // 배수를 켠 뒤에도 최종 점수가 서버 상한(999)을 넘지 않게 기본 점수를 함께 조인다.
    const maxBase = Math.floor(MAX_GOSTOP_SCORE / 2 ** multipliers.length)
    onChange({ ...state, multipliers, base: Math.min(state.base, maxBase) })
  }

  const togglePenalty = (userId: string, flag: PenaltyFlagId) => {
    const flags = state.penalties[userId] ?? []
    const next = flags.includes(flag)
      ? flags.filter((item) => item !== flag)
      : [...flags, flag]
    onChange({ ...state, penalties: { ...state.penalties, [userId]: next } })
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-sm font-medium">{d.dealer.scoreLabel}</span>
        <Stepper
          value={state.base}
          onChange={(base) => onChange({ ...state, base })}
          min={1}
          max={Math.floor(MAX_GOSTOP_SCORE / factor)}
          ariaLabel={d.dealer.scoreAria}
          className="flex-1"
        />
      </div>

      <div className="grid grid-cols-2 gap-2" role="group" aria-label={d.dealer.gostopMultiplierAria}>
        {GOSTOP_MULTIPLIERS.map((item) => {
          const active = state.multipliers.includes(item.id)
          return (
            <Button
              key={item.id}
              variant={active ? 'primary' : 'surface'}
              className={active ? undefined : 'border border-white/10'}
              pressed={active}
              onClick={() => toggleMultiplier(item.id)}
            >
              {item.label} ×2
            </Button>
          )
        })}
      </div>

      <p className="text-sm font-medium">
        {format(d.dealer.gostopTotalLine, {
          base: state.base,
          factor,
          total,
          chips: formatChips(perLoserPay),
        })}
      </p>

      {losers.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted">{d.dealer.gostopPenaltyTitle}</p>
          {losers.map((loser) => {
            const flags = state.penalties[loser.userId] ?? []
            // 서버가 잔액 초과분을 올인으로 깎는 것과 동일하게 실제 부과액을 보여준다.
            const charge = Math.min(perLoserPay * penaltyFactorOf(flags), loser.balance)
            return (
              <div key={loser.userId} className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-sm">{loser.displayName}</span>
                {PENALTY_FLAGS.map((flag) => {
                  const active = flags.includes(flag.id)
                  return (
                    <Button
                      key={flag.id}
                      size="md"
                      variant={active ? 'danger' : 'surface'}
                      className={active ? undefined : 'border border-white/10'}
                      pressed={active}
                      aria-label={`${loser.displayName} ${flag.label}`}
                      onClick={() => togglePenalty(loser.userId, flag.id)}
                    >
                      {flag.label}
                    </Button>
                  )
                })}
                <span className="min-w-16 shrink-0 text-right text-sm font-bold tabular-nums text-warn">
                  {charge > 0 ? `−${formatChips(charge)}` : '0'}
                </span>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
