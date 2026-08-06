/**
 * 섯다·포커 공용 레이즈 규칙. `rooms.rulePreset` JSON의 `raiseRule` 필드로 저장한다
 * (마이그레이션 없음 — `game/action-helpers.ts`의 `readRaiseRule`이 읽는다).
 *
 * - `free`(기본값): 기존 동작 그대로 — 최소 레이즈 하한만 강제, 상한 없음. `raiseRule`을
 *   지정하지 않은 기존 방·새 방은 전부 이 값으로 읽힌다(하위 호환).
 * - `ttadang`: 재레이즈는 직전 최고 베팅액(`lastBet`)의 정확히 2배로만 낼 수 있다. 이번
 *   라운드 첫 베팅(`lastBet === 0`)은 `baseBet` 그대로.
 * - `pot_limit`: 이번 액션 뒤 내 누적 베팅(`contributionBefore + amount`)이 "콜을 채운 뒤의
 *   팟"까지만 갈 수 있다 — 상한은 `lastBet + pot + 콜 부족액`이고, 판을 여는 베팅
 *   (`pot === 0`)은 `baseBet`까지다.
 */
export type RaiseRule = 'free' | 'ttadang' | 'pot_limit'

export const RAISE_RULES: readonly RaiseRule[] = ['free', 'ttadang', 'pot_limit']

export function isRaiseRule(value: unknown): value is RaiseRule {
  return value === 'free' || value === 'ttadang' || value === 'pot_limit'
}

export interface RaiseRuleCheck {
  readonly rule: RaiseRule
  /** 이번 액션으로 "추가로" 내는 금액 — `placeBet`의 `amount`와 같은 단위(누적 아님). */
  readonly amount: number
  /** 이번 액션 이전까지 내가 이번 라운드에 낸 누적액(`contributedBy`). */
  readonly contributionBefore: number
  /** 이번 액션 이전 라운드 최고 베팅액(`roundBetState.currentToCall`). */
  readonly lastBet: number
  readonly baseBet: number
  /** 이번 액션 이전 라운드 팟 총액. */
  readonly pot: number
}

/** 위반이면 i18n 에러 키, 통과면 `null`. `raise` 액션에만 적용한다(check/call/fold/allin 제외). */
export function raiseRuleViolation(check: RaiseRuleCheck): string | null {
  const { rule, amount, contributionBefore, lastBet, baseBet, pot } = check
  if (rule === 'free') return null

  const totalAfter = contributionBefore + amount

  if (rule === 'ttadang') {
    const target = lastBet === 0 ? baseBet : lastBet * 2
    return totalAfter === target ? null : 'errors.raiseMustFollowTtadang'
  }

  // 상한을 `pot`(이 액션 이전 팟) 하나로 잡으면 규칙이 스스로를 막는다. 레이즈는 정의상
  // `totalAfter > lastBet`이어야 하는데(`round-bet-state.ts`의 `minimumRaiseAmount`),
  // `pot`은 기여액 합이라 참가자가 둘이면 `pot === lastBet`이 되고 그 사이에 legal한 값이
  // 하나도 없다. 판을 여는 첫 베팅은 더해서 `pot === 0`이라 아무 금액도 통과하지 못했다 —
  // 팟 리밋 방에서는 올인 말고는 베팅 자체가 불가능했다.
  //
  // 그래서 실제 팟 리밋 계산을 쓴다: 콜을 채운 뒤의 팟만큼 더 걸 수 있다
  // = `lastBet + (pot + 콜 부족액)`. 판을 여는 베팅은 이 앱에 앤티·블라인드가 없어
  // 상한이 0이 되므로 `baseBet`을 바닥으로 둔다(따당의 `lastBet === 0` 처리와 같은 취지).
  const callNeeded = Math.max(0, lastBet - contributionBefore)
  const cap = Math.max(baseBet, lastBet + pot + callNeeded)
  return totalAfter <= cap ? null : 'errors.raiseExceedsPotLimit'
}
