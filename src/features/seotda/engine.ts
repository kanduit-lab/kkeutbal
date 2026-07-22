import type { HwatuCard } from '../hwatu/types'
import type { SeotdaHand, SeotdaOutcome, SeotdaRules } from './types'

/**
 * 섯다 판정 엔진.
 *
 * 순수 함수만 둔다 — I/O · DB · 시간 · 난수 금지 (docs/01-architecture.md 모듈 경계).
 *
 * 2단계로 나눈 이유는 docs/04-game-engines.md 참조:
 *   1단계 evaluateSeotdaHand  — 내 패의 절대 등급. 족보 Advisor 가 이것만 쓴다.
 *   2단계 resolveSeotdaShowdown — 상대 의존 판정(암행어사·땡잡이·구사) 포함 승부 확정.
 * 분리하지 않으면 Advisor 가 상대 패를 알아야 하는 모순이 생긴다.
 *
 * @todo Phase 1 (docs/09-roadmap.md) — TDD 로 구현.
 *   기대값 테이블(190조합)을 `seotda.fixtures.ts` 에 사람이 먼저 작성한 뒤 구현한다.
 *   엔진 출력으로 기대값을 만들면 버그가 그대로 고정되므로 금지.
 */

const NOT_IMPLEMENTED = 'not implemented — docs/04-game-engines.md 참조, Phase 1 대상'

/**
 * 두 장의 절대 족보를 판정한다.
 *
 * @param cards 섯다 덱(1~10월 비피 20장)의 카드 2장
 * @throws 덱에 없는 카드거나 2장이 아니면 오류
 */
export function evaluateSeotdaHand(_cards: readonly [HwatuCard, HwatuCard]): SeotdaHand {
  throw new Error(`evaluateSeotdaHand: ${NOT_IMPLEMENTED}`)
}

/**
 * 여러 손패의 승부를 확정한다. 암행어사·땡잡이·구사 같은 상대 의존 규칙을 여기서 적용한다.
 *
 * @param hands 참가자 순서대로의 손패
 * @param rules 방의 룰 프리셋 (rooms.rule_preset)
 */
export function resolveSeotdaShowdown(
  _hands: readonly SeotdaHand[],
  _rules: SeotdaRules,
): SeotdaOutcome {
  throw new Error(`resolveSeotdaShowdown: ${NOT_IMPLEMENTED}`)
}

/** 사람이 읽는 설명. Advisor UI 에 그대로 노출한다. */
export function describeSeotdaHand(_hand: SeotdaHand): string {
  throw new Error(`describeSeotdaHand: ${NOT_IMPLEMENTED}`)
}
