import type { BetActionKind, BetStatus } from '../game/types'

/** DB·클라이언트 스냅샷 모두에서 쓸 수 있는, 확정 베팅의 최소 형태. */
export interface AcceptedBetAction {
  readonly userId: string
  readonly action: BetActionKind
  readonly amount: number
  readonly status: BetStatus
}

export interface RoundBetState {
  /** 사용자별 이번 판 실제 누적 납입액. */
  readonly contributionByUser: ReadonlyMap<string, number>
  /** 현재 콜해야 할 최고 누적 납입액. */
  readonly currentToCall: number
}

/**
 * 액션 금액은 "이번 액션에서 실제로 옮긴 칩"이다. 따라서 콜·레이즈 기준은 마지막 액션이나
 * 단일 최고 액션이 아니라 사용자별 누적 납입액에서 파생한다.
 */
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

/** 레이즈에 필요한 이번 액션의 최소 추가 납입액. */
export function minimumRaiseAmount(state: RoundBetState, userId: string, baseBet: number): number {
  return state.currentToCall === 0 ? baseBet : neededToCall(state, userId) + 1
}
