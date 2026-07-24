'use client'

import { format, useDict } from '@/lib/i18n/client'
import { Button, Stepper } from '@/components/ui'
import type { MemberView } from '../types'
import { formatChips } from './shared'

/**
 * 고스톱 승자 확정 점수 폼.
 *
 * 이 화면은 획득 패를 다시 판정하는 엔진이 아니라, 딜러가 확인한 카드 점수에 판 상황의
 * 선언(고·흔들기·폭탄)을 적용한다. 계산 규칙은 `gostop/scoring.ts`의 표준 프리셋과 같다.
 * 총통은 점수 배수가 아닌 즉시 승리 규칙이므로 여기에서 ×2로 취급하지 않는다.
 */

/** 서버 endRoundSchema의 score 상한. */
const MAX_GOSTOP_SCORE = 999
/** 비정상적인 긴 선언으로 점수가 급격히 커지는 것을 UI에서 막는 상한. */
const MAX_DECLARATION_COUNT = 8

/** 패자별 박 — 각 ×2, 둘 다면 ×4 (endRound loserPenalties factor). */
const PENALTY_FLAGS = [
  { id: 'pibak', label: '피박' },
  { id: 'gwangbak', label: '광박' },
] as const
type PenaltyFlagId = (typeof PENALTY_FLAGS)[number]['id']

export interface GostopScoreState {
  /** 카드에서 나온 기본 점수. 고 가산점은 별도로 계산한다. */
  readonly base: number
  readonly goCount: number
  readonly shakeCount: number
  readonly bombCount: number
  /** 패자 userId → 켜진 박 플래그. 승자로 바뀐 멤버의 플래그는 제출 시 자연히 제외된다. */
  readonly penalties: Readonly<Record<string, readonly PenaltyFlagId[]>>
}

export const initialGostopScore: GostopScoreState = {
  base: 3,
  goCount: 0,
  shakeCount: 0,
  bombCount: 0,
  penalties: {},
}

/** 표준 룰: 1고 +1, 2고 이상 +2점(그 이상은 점수 가산 없이 배수만 누적). */
function goBonus(goCount: number): number {
  if (goCount <= 0) return 0
  return goCount === 1 ? 1 : 2
}

/** 표준 룰: 3고부터 고당 ×2, 흔들기/폭탄은 선언 1회마다 ×2. */
function commonFactor(state: GostopScoreState): number {
  const goDoublings = Math.max(0, state.goCount - 2)
  return 2 ** (goDoublings + state.shakeCount + state.bombCount)
}

/** 제출용 최종 점수 — (카드 기본 점수 + 고 가산) × 선언 배수. */
export function gostopEffectiveScore(state: GostopScoreState): number {
  return (state.base + goBonus(state.goCount)) * commonFactor(state)
}

function maxBaseFor(state: GostopScoreState): number {
  return Math.max(1, Math.floor(MAX_GOSTOP_SCORE / commonFactor(state)) - goBonus(state.goCount))
}

function normalizedState(state: GostopScoreState): GostopScoreState {
  return { ...state, base: Math.min(state.base, maxBaseFor(state)) }
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
  const { d, locale } = useDict()
  const bonus = goBonus(state.goCount)
  const factor = commonFactor(state)
  const total = gostopEffectiveScore(state)
  /** 박 없는 패자 1명이 내는 칩. */
  const perLoserPay = total * pointValue

  const updateCount = (key: 'goCount' | 'shakeCount' | 'bombCount', value: number) => {
    onChange(normalizedState({ ...state, [key]: value }))
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
          max={maxBaseFor(state)}
          ariaLabel={d.dealer.scoreAria}
          className="flex-1"
        />
      </div>

      <div className="space-y-2" role="group" aria-label={d.dealer.gostopDeclarationAria}>
        {([
          ['goCount', d.dealer.gostopGoLabel, d.dealer.gostopGoAria],
          ['shakeCount', d.dealer.gostopShakeLabel, d.dealer.gostopShakeAria],
          ['bombCount', d.dealer.gostopBombLabel, d.dealer.gostopBombAria],
        ] as const).map(([key, label, ariaLabel]) => (
          <div key={key} className="flex items-center gap-2">
            <p className="w-14 shrink-0 text-sm font-medium text-muted">{label}</p>
            <Stepper
              value={state[key]}
              onChange={(value) => updateCount(key, value)}
              min={0}
              max={MAX_DECLARATION_COUNT}
              ariaLabel={ariaLabel}
              className="flex-1"
            />
          </div>
        ))}
      </div>

      <p className="text-sm font-medium">
        {format(d.dealer.gostopTotalLine, {
          base: state.base,
          bonus,
          factor,
          total,
          chips: formatChips(perLoserPay, locale),
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
                  {charge > 0 ? `−${formatChips(charge, locale)}` : '0'}
                </span>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
