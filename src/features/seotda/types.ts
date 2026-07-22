import type { HwatuCard } from '../hwatu/types'

/**
 * 섯다 족보 타입 · 서열 상수.
 * 규칙 근거는 docs/04-game-engines.md "섯다 엔진" 절.
 */

export type SeotdaCategory = 'gwangttaeng' | 'ttaeng' | 'special' | 'kkeut'

/** 상대 의존 판정 플래그. 절대 서열이 아니라 맞붙었을 때만 효력이 있다. */
export type SeotdaTrait = 'amhaengeosa' | 'ttaengjabi' | 'gusa'

export interface SeotdaHand {
  readonly cards: readonly [HwatuCard, HwatuCard]
  readonly category: SeotdaCategory
  /** 표시용 이름. 예: '38광땡', '장땡', '독사', '갑오', '망통' */
  readonly label: string
  /** 서열 정수. 클수록 강하다. 비교는 오직 이 값으로만 한다. */
  readonly rank: number
  readonly traits: readonly SeotdaTrait[]
}

export interface SeotdaRules {
  /** 암행어사(4·7)가 광땡을 잡는다. */
  readonly amhaengeosa: boolean
  /** 땡잡이(3·7)가 땡을 잡는다. 광땡에는 효력 없음. */
  readonly ttaengjabi: boolean
  /** 구사(4·9) 보유 시 판 무효 → 재경기. */
  readonly gusa: boolean
  /** 동급 족보 충돌 시 처리. */
  readonly tieBreak: 'replay' | 'dealer-wins'
}

export const SEOTDA_RULES_STANDARD: SeotdaRules = Object.freeze({
  amhaengeosa: true,
  ttaengjabi: true,
  gusa: true,
  tieBreak: 'replay',
})

/**
 * 서열 상수.
 *
 * 구간을 띄워 둔 이유: 나중에 지역 룰로 족보가 하나 끼어들어도 기존 값을 재계산하지 않아도 된다.
 * 값 자체에 의미는 없고 대소 관계만 계약이다.
 */
export const SEOTDA_RANK = Object.freeze({
  /** 광땡 — 38 > 18 > 13 */
  GWANGTTAENG_38: 1000,
  GWANGTTAENG_18: 990,
  GWANGTTAENG_13: 980,

  /** 땡 — 장땡(10) 900 ~ 1땡 810. `TTAENG_BASE + month * 10` */
  TTAENG_BASE: 800,

  /** 특수 하위 족보 — 땡보다 낮고 끗보다 높다 */
  ALLI: 760, // 1·2
  DOKSA: 750, // 1·4
  GUPPING: 740, // 1·9
  JANGPPING: 730, // 1·10
  JANGSA: 720, // 4·10
  SERYUK: 710, // 4·6

  /** 끗 — 갑오(9끗) 609 ~ 망통(0끗) 600. `KKEUT_BASE + kkeut` */
  KKEUT_BASE: 600,
} as const)

/** 특수 하위 족보 정의. 월 조합(오름차순)으로 식별한다. */
export const SEOTDA_SPECIALS: ReadonlyArray<{
  readonly months: readonly [number, number]
  readonly label: string
  readonly rank: number
}> = Object.freeze([
  { months: [1, 2], label: '알리', rank: SEOTDA_RANK.ALLI },
  { months: [1, 4], label: '독사', rank: SEOTDA_RANK.DOKSA },
  { months: [1, 9], label: '구삥', rank: SEOTDA_RANK.GUPPING },
  { months: [1, 10], label: '장삥', rank: SEOTDA_RANK.JANGPPING },
  { months: [4, 10], label: '장사', rank: SEOTDA_RANK.JANGSA },
  { months: [4, 6], label: '세륙', rank: SEOTDA_RANK.SERYUK },
])

/** 상대 의존 판정패 정의. */
export const SEOTDA_TRAIT_COMBOS: ReadonlyArray<{
  readonly months: readonly [number, number]
  readonly trait: SeotdaTrait
}> = Object.freeze([
  { months: [4, 7], trait: 'amhaengeosa' },
  { months: [3, 7], trait: 'ttaengjabi' },
  { months: [4, 9], trait: 'gusa' },
])

export type SeotdaOutcome =
  | { readonly kind: 'win'; readonly winnerIndex: number; readonly reason: string }
  | { readonly kind: 'replay'; readonly reason: string }
  | { readonly kind: 'tie'; readonly indexes: readonly number[] }
