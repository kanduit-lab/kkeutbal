import type { BetActionKind, BetStatus } from '../game/types'

export interface AcceptedBetAction {
  readonly userId: string
  readonly action: BetActionKind
  readonly amount: number
  readonly status: BetStatus
}

export interface RoundBetState {
  readonly contributionByUser: ReadonlyMap<string, number>

  readonly currentToCall: number
}

export function roundBetState(actions: readonly AcceptedBetAction[]): RoundBetState {
  const contributionByUser = new Map<string, number>()
  for (const action of actions) {
    if (action.status !== 'accepted' || action.amount <= 0) continue
    contributionByUser.set(
      action.userId,
      (contributionByUser.get(action.userId) ?? 0) + action.amount,
    )
  }
  const currentToCall = Math.max(0, ...contributionByUser.values())
  return { contributionByUser, currentToCall }
}

export function contributedBy(state: RoundBetState, userId: string): number {
  return state.contributionByUser.get(userId) ?? 0
}

export function neededToCall(state: RoundBetState, userId: string): number {
  return Math.max(0, state.currentToCall - contributedBy(state, userId))
}

export function minimumRaiseAmount(state: RoundBetState, userId: string, baseBet: number): number {
  return state.currentToCall === 0 ? baseBet : neededToCall(state, userId) + 1
}

/**
 * 이번 라운드에 현재까지 걸린 팟 총액 — accepted 액션들의 기여액 합. `chipLedger`를 다시 읽지
 * 않고 이미 로드한 액션 목록에서 순수하게 구한다(레이즈 규칙 판정용, `raise-rule.ts`).
 */
export function totalContributed(state: RoundBetState): number {
  let total = 0
  for (const amount of state.contributionByUser.values()) total += amount
  return total
}