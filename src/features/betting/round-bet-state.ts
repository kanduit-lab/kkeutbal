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
 * 남은 칩으로 지금 걸린 베팅을 따라갈 수 있는가 — 판에 남을 자격 판정.
 *
 * 이 앱에는 사이드팟이 없다(`round-finalize.ts`의 `creditPotToWinner`가 팟 전체를 승자 한 명에게
 * 준다). 그래서 "콜 금액을 못 채우는 사람도 판에 남는다"를 허용하면 팟을 나눌 수단이 없어진다 —
 * 근거와 결정은 `bet-amount-rule.ts`의 `checkBetAmount` 주석과 `docs/04-game-engines.md`
 * "베팅 규칙" 절에 있다.
 *
 * 서버 규칙(`bet-amount-rule.ts`)과 UI 게이트가 같은 판정을 쓰도록 여기 한 곳에만 둔다.
 * 맞출 베팅이 없으면(`neededToCall === 0`) 잔액 0이어도 true — 체크·다이까지 막지는 않는다.
 */
export function canCoverCall(state: RoundBetState, userId: string, balance: number): boolean {
  return balance >= neededToCall(state, userId)
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