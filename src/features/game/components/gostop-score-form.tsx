'use client'

import { format, useDict } from '@/lib/i18n/client'
import { Button, Stepper } from '@/components/ui'
import type { MemberView } from '../types'
import { formatChips } from './shared'

const MAX_GOSTOP_SCORE = 999

const MAX_DECLARATION_COUNT = 8

const PENALTY_FLAGS = [
  { id: 'pibak', label: '피박' },
  { id: 'gwangbak', label: '광박' },
] as const
type PenaltyFlagId = (typeof PENALTY_FLAGS)[number]['id']

export interface GostopScoreState {
  readonly base: number
  readonly goCount: number
  readonly shakeCount: number
  readonly bombCount: number

  readonly penalties: Readonly<Record<string, readonly PenaltyFlagId[]>>
}

export const initialGostopScore: GostopScoreState = {
  base: 3,
  goCount: 0,
  shakeCount: 0,
  bombCount: 0,
  penalties: {},
}

function goBonus(goCount: number): number {
  if (goCount <= 0) return 0
  return goCount === 1 ? 1 : 2
}

function commonFactor(state: GostopScoreState): number {
  const goDoublings = Math.max(0, state.goCount - 2)
  return 2 ** (goDoublings + state.shakeCount + state.bombCount)
}

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

  losers: readonly MemberView[]
  pointValue: number
}) {
  const { d, locale } = useDict()
  const bonus = goBonus(state.goCount)
  const factor = commonFactor(state)
  const total = gostopEffectiveScore(state)

  const perLoserPay = total * pointValue

  const updateCount = (key: 'goCount' | 'shakeCount' | 'bombCount', value: number) => {
    onChange(normalizedState({ ...state, [key]: value }))
  }

  const togglePenalty = (userId: string, flag: PenaltyFlagId) => {
    const flags = state.penalties[userId] ?? []
    const next = flags.includes(flag) ? flags.filter((item) => item !== flag) : [...flags, flag]
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
          decreaseLabel={d.ui.decrease}
          increaseLabel={d.ui.increase}
          className="flex-1"
        />
      </div>
      <div className="space-y-2" role="group" aria-label={d.dealer.gostopDeclarationAria}>
        {(
          [
            ['goCount', d.dealer.gostopGoLabel, d.dealer.gostopGoAria],
            ['shakeCount', d.dealer.gostopShakeLabel, d.dealer.gostopShakeAria],
            ['bombCount', d.dealer.gostopBombLabel, d.dealer.gostopBombAria],
          ] as const
        ).map(([key, label, ariaLabel]) => (
          <div key={key} className="flex items-center gap-2">
            <p className="w-14 shrink-0 text-sm font-medium text-muted">{label}</p>
            <Stepper
              value={state[key]}
              onChange={(value) => updateCount(key, value)}
              min={0}
              max={MAX_DECLARATION_COUNT}
              ariaLabel={ariaLabel}
              decreaseLabel={d.ui.decrease}
              increaseLabel={d.ui.increase}
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