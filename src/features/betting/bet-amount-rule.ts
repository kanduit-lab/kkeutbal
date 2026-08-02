import {
  canCoverCall,
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
 * 달라진다** — `validateBetSemantics`에 있던 원래 순서를 유지하되 콜 커버 게이트만 끼워 넣었다:
 * check → fold → 잔액 바닥 → **콜 커버** → allin → 초과 금액 → call → 레이즈 최소액 →
 * 레이즈=잔액 전액 → 레이즈 규칙.
 */
export function checkBetAmount(check: BetAmountCheck): string | null {
  const { state, userId, action, amount, balance, baseBet, raiseRule } = check
  const callNeeded = neededToCall(state, userId)

  if (action === 'check') return callNeeded === 0 ? null : 'errors.cannotCheckAfterBet'
  if (action === 'fold') return null
  if (balance < 1) return 'errors.insufficientBalance'

  // ── 결정: 짧은 올인·짧은 콜을 허용하지 않는다 (사이드팟을 만들지 않는 쪽) ──────────────────
  //
  // 이 앱에는 사이드팟이 없다. `round-finalize.ts`의 `creditPotToWinner`가 팟 전체를 승자 한
  // 명에게 넘기는 단일 팟 모델이고, 이 결정은 그 모델을 유지하기로 한 결과다.
  //
  // 그래서 "500칩만 낸 사람이 5000짜리 판에 남는다"를 허용하면 판이 끝난 뒤 팟을 나눌 수단이
  // 없다. 예전에는 그 짧은 올인이 허용되는 대신 `round-completion.ts`가 기여액 불일치를 이유로
  // 영원히 `active`를 반환해 판 자체가 잠겼다(딜러의 판 종료·판 무효 말고는 탈출구가 없었다).
  //
  // 두 갈래 중 이쪽을 고른 이유:
  // (a) 짧은 올인을 완료로 인정하면 500칩 낸 사람이 남의 5000칩을 통째로 가져간다. 이 앱은
  //     실물 카드로 노는 사람들이 나중에 이 숫자를 보고 실제로 정산하는 **기록 도구**라, 틀린
  //     금액을 자신 있게 출력하는 쪽이 잠기는 쪽보다 더 나쁘다.
  // (b) 콜을 못 받으면 다이 — MT·모임에서 실제로 쓰는 하우스 룰과 같고, 이 앱에는 바이인
  //     (`features/budget/`)이 이미 있어서 칩을 더 받고 이어가는 정상 경로가 존재한다.
  //
  // 다이는 이 게이트 위에서 무조건 통과하므로(위 `action === 'fold'`) 잔액이 얼마든 판에서
  // 빠질 수는 항상 있다. 판이 잠기지 않는다.
  //
  // 남는 구멍은 하나: **정상 올인 뒤에 남들이 더 올리는** 경우다. 그때는 올인한 사람이 더 낼
  // 칩이 없어 기여액이 자동으로 뒤처지는데, 이건 규칙 층에서 막을 수 없다(이 함수는 다른
  // 참가자의 잔액을 모른다). 그 교착은 `round-completion.ts`가 "올인 = 정산 완료"로 풀고,
  // 그때 초과분은 이미 그 위험을 알고 더 건 사람들끼리의 몫이다.
  if (!canCoverCall(state, userId, balance)) return 'errors.cannotCoverCurrentBet'

  if (action === 'allin') {
    return amount === balance ? null : 'errors.allInMustUseFullBalance'
  }
  if (amount > balance) return 'errors.insufficientBalance'

  if (action === 'call') {
    if (callNeeded === 0) return 'errors.noBetToCall'
    // 위 커버 게이트를 통과했으므로 `callNeeded <= balance`다 — 짧은 콜(`min(callNeeded, balance)`)
    // 경로는 더 이상 존재하지 않는다.
    return amount === callNeeded ? null : 'errors.invalidCallAmount'
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
