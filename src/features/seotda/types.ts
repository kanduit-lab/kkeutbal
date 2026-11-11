import type { CardKind, HwatuCard } from '../hwatu/types'

export type SeotdaCategory = 'gwangttaeng' | 'ttaeng' | 'special' | 'kkeut'

export type SeotdaTrait = 'amhaengeosa' | 'ttaengjabi' | 'gusa'

/** 참가자 한 명이 받는 카드 수. 3장 섯다는 세 장 중 두 장을 골라 승부한다 */
export type SeotdaCardCount = 2 | 3

export interface SeotdaHand {
  readonly cards: readonly [HwatuCard, HwatuCard]
  readonly category: SeotdaCategory

  readonly label: string

  readonly rank: number
  readonly traits: readonly SeotdaTrait[]
}

export interface SeotdaRules {
  readonly amhaengeosa: boolean

  readonly ttaengjabi: boolean

  readonly gusa: boolean

  readonly tieBreak: 'replay' | 'dealer-wins'
}

export const SEOTDA_RULES_STANDARD: SeotdaRules = Object.freeze({
  amhaengeosa: true,
  ttaengjabi: true,
  gusa: true,
  tieBreak: 'replay',
})

export const SEOTDA_RANK = Object.freeze({
  GWANGTTAENG_38: 1000,
  GWANGTTAENG_18: 990,
  GWANGTTAENG_13: 980,
  TTAENG_BASE: 800,
  ALLI: 760,
  DOKSA: 750,
  GUPPING: 740,
  JANGPPING: 730,
  JANGSA: 720,
  SERYUK: 710,
  KKEUT_BASE: 600,
} as const)

/**
 * 특수패는 월 조합만으로 정해지지 않는다. `cards`는 그 달에서 필요한 카드 종류를
 * 월이 낮은 쪽부터 적은 것이다 — 1·9가 광+청단이면 특수패가 아니라 0끗이다.
 */
export const SEOTDA_SPECIALS: ReadonlyArray<{
  readonly months: readonly [number, number]
  readonly cards: readonly [CardKind, CardKind]
  readonly label: string
  readonly rank: number
}> = Object.freeze([
  { months: [1, 2], cards: ['tti', 'yeol'], label: '알리', rank: SEOTDA_RANK.ALLI },
  { months: [1, 4], cards: ['gwang', 'yeol'], label: '독사', rank: SEOTDA_RANK.DOKSA },
  { months: [1, 9], cards: ['tti', 'tti'], label: '구삥', rank: SEOTDA_RANK.GUPPING },
  { months: [1, 10], cards: ['tti', 'tti'], label: '장삥', rank: SEOTDA_RANK.JANGPPING },
  { months: [4, 10], cards: ['yeol', 'yeol'], label: '장사', rank: SEOTDA_RANK.JANGSA },
  { months: [4, 6], cards: ['yeol', 'yeol'], label: '세륙', rank: SEOTDA_RANK.SERYUK },
])

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