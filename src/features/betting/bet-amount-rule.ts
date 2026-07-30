import {
  contributedBy,
  minimumRaiseAmount,
  neededToCall,
  totalContributed,
  type RoundBetState,
} from './round-bet-state'
import { raiseRuleViolation, type RaiseRule } from './raise-rule'
import type { BetActionKind } from '../game/types'

export interface BetAmountCheck {
  readonly state: RoundBetState
  readonly userId: string
  readonly action: BetActionKind
  /** 이번 액션으로 "추가로" 내는 금액 — 누적 아님. `placeBet`의 `amount`와 같은 단위. */
  readonly amount: number
  readonly balance: number
  readonly baseBet: number
  readonly raiseRule: RaiseRule
}

/**
 * 베팅 금액·잔액·레이즈 규칙 판정 — 순수 함수, I/O 없음. `bet-semantics.ts`의
 * `validateBetSemantics`가 턴 순서·라운드 완료 게이트를 통과시킨 뒤 호출한다.
 *
 * 위반이면 i18n 에러 키, 통과면 `null`. **분기 순서를 바꾸면 사용자에게 보이는 에러가
 * 달라진다** — `validateBetSemantics`에 있던 원래 순서를 그대로 유지한다: check → fold →
 * 잔액 바닥 → allin → 초과 금액 → call → 레이즈 최소액 → 레이즈=잔액 전액 → 레이즈 규칙.
 */
export function checkBetAmount(check: BetAmountCheck): string | null {
  const { state, userId, action, amount, balance, baseBet, raiseRule } = check
  const callNeeded = neededToCall(state, userId)

  if (action === 'check') return callNeeded === 0 ? null : 'errors.cannotCheckAfterBet'
  if (action === 'fold') return null
  if (balance < 1) return 'errors.insufficientBalance'

  if (action === 'allin') {
    return amount === balance ? null : 'errors.allInMustUseFullBalance'
  }
  if (amount > balance) return 'errors.insufficientBalance'

  if (action === 'call') {
    if (callNeeded === 0) return 'errors.noBetToCall'
    return amount === Math.min(callNeeded, balance) ? null : 'errors.invalidCallAmount'
  }

  const minRaise = minimumRaiseAmount(state, userId, baseBet)
  if (amount < minRaise) return 'errors.raiseBelowMinimum'
  if (amount === balance) return 'errors.allInMustUseAllInAction'

  return raiseRuleViolation({
    rule: raiseRule,
    amount,
    contributionBefore: contributedBy(state, userId),
    lastBet: state.currentToCall,
    baseBet,
    pot: totalContributed(state),
  })
}
