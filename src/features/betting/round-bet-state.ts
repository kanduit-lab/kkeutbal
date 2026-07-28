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