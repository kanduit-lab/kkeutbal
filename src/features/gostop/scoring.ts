import type { HwatuCard } from '../hwatu/types'
import type { GostopCapture, GostopContext, GostopRules, GostopScore } from './types'

/**
 * 고스톱 점수 엔진.
 *
 * 순수 함수만 둔다 — I/O · DB · 시간 · 난수 금지 (docs/01-architecture.md 모듈 경계).
 *
 * 계산 순서(docs/04-game-engines.md):
 *   분류 집계 → 기본 점수 → 조합 보너스 → 고 가산·배수 → 박 배수 → 선언 배수 → 총점
 *
 * `breakdown` 을 반드시 채운다. 고스톱 분쟁의 대부분은 "왜 그 점수냐"이고,
 * 총점만 주면 앱이 심판 역할을 못 한다.
 *
 * @todo Phase 8 (docs/09-roadmap.md) — 경계값·배수 조합 테스트와 함께 구현.
 */

const NOT_IMPLEMENTED = 'not implemented — docs/04-game-engines.md 참조, Phase 8 대상'

/** 획득 카드를 분류별로 집계한다. */
export function captureOf(_cards: readonly HwatuCard[], _rules: GostopRules): GostopCapture {
  throw new Error(`captureOf: ${NOT_IMPLEMENTED}`)
}

/** 집계 + 판 상황으로 최종 점수를 계산한다. */
export function scoreGostop(
  _capture: GostopCapture,
  _context: GostopContext,
  _rules: GostopRules,
): GostopScore {
  throw new Error(`scoreGostop: ${NOT_IMPLEMENTED}`)
}

/** 같은 월 4장 보유 여부 (총통). */
export function hasChongtong(_cards: readonly HwatuCard[]): boolean {
  throw new Error(`hasChongtong: ${NOT_IMPLEMENTED}`)
}
