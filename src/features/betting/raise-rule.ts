/**
 * 섯다·포커 공용 레이즈 규칙. `rooms.rulePreset` JSON의 `raiseRule` 필드로 저장한다
 * (마이그레이션 없음 — `game/action-helpers.ts`의 `readRaiseRule`이 읽는다).
 *
 * - `free`(기본값): 기존 동작 그대로 — 최소 레이즈 하한만 강제, 상한 없음. `raiseRule`을
 *   지정하지 않은 기존 방·새 방은 전부 이 값으로 읽힌다(하위 호환).
 * - `ttadang`: 재레이즈는 직전 최고 베팅액(`lastBet`)의 정확히 2배로만 낼 수 있다. 이번
 *   라운드 첫 베팅(`lastBet === 0`)은 `baseBet` 그대로.
 * - `pot_limit`: 이번 액션 뒤 내 누적 베팅(`contributionBefore + amount`)이 이번 라운드
 *   팟(`pot`)을 넘을 수 없다.
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

  return totalAfter <= pot ? null : 'errors.raiseExceedsPotLimit'
}
