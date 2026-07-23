import { SEOTDA_RANK, type SeotdaHand, type SeotdaRules, type SeotdaTrait } from './types'

/**
 * 패별 상황 안내 — 무엇에 잡히고, 무엇을 잡고, 판이 어떻게 흘러갈 수 있는지.
 *
 * 문구가 아니라 **코드**를 돌려준다. 한국어/영어 문장은 사전이 갖고, 확률 같은 수치는
 * 어드바이저가 붙인다 — 엔진은 룰 관계만 안다 (순수 함수, I/O 금지 규칙).
 */
export type SeotdaAdviceCode =
  /** 내 패가 구사 — 누가 들고 있든 판이 무효가 된다. */
  | 'gusaReplay'
  /** 내 패가 암행어사 — 상대 광땡을 잡는다. */
  | 'amhaengeosaCatches'
  /** 내 패가 땡잡이 — 상대 땡을 잡는다. 광땡은 못 잡는다. */
  | 'ttaengjabiCatches'
  /** 내 패가 광땡 — 암행어사에게 잡힐 수 있다. */
  | 'caughtByAmhaengeosa'
  /** 내 패가 땡 — 땡잡이에게 잡힐 수 있다. */
  | 'caughtByTtaengjabi'
  /** 잡힐 일이 없는 최상위 패. */
  | 'unbeatable'
  /** 최하위 끗(망통). */
  | 'lowest'

/**
 * 내 패를 잡을 수 있는 상대 판정패. 없으면 null.
 *
 * 잡기는 **그 판의 최고 족보**에만 걸린다(resolveSeotdaShowdown 2단계). 내 패가 광땡이면
 * 암행어사가, 땡이면 땡잡이가 후보다. 룰 토글이 꺼져 있으면 잡히지 않는다.
 */
export function catcherTraitAgainst(hand: SeotdaHand, rules: SeotdaRules): SeotdaTrait | null {
  if (hand.category === 'gwangttaeng' && rules.amhaengeosa) return 'amhaengeosa'
  if (hand.category === 'ttaeng' && rules.ttaengjabi) return 'ttaengjabi'
  return null
}

/** 이 패에 붙일 안내 코드. 중요한 것부터 순서대로 담는다. */
export function seotdaAdvice(hand: SeotdaHand, rules: SeotdaRules): readonly SeotdaAdviceCode[] {
  const codes: SeotdaAdviceCode[] = []

  // 구사는 서열과 무관하게 판 자체를 무효로 만든다 — 가장 먼저 알려야 한다.
  if (rules.gusa && hand.traits.includes('gusa')) codes.push('gusaReplay')

  if (rules.amhaengeosa && hand.traits.includes('amhaengeosa')) codes.push('amhaengeosaCatches')
  if (rules.ttaengjabi && hand.traits.includes('ttaengjabi')) codes.push('ttaengjabiCatches')

  const catcher = catcherTraitAgainst(hand, rules)
  if (catcher === 'amhaengeosa') codes.push('caughtByAmhaengeosa')
  if (catcher === 'ttaengjabi') codes.push('caughtByTtaengjabi')

  // 잡힐 일이 없는 38광땡만 무적이다 — 암행어사 룰이 켜져 있으면 무적이 아니다.
  if (hand.rank === SEOTDA_RANK.GWANGTTAENG_38 && catcher === null) codes.push('unbeatable')
  if (hand.rank === SEOTDA_RANK.KKEUT_BASE) codes.push('lowest')

  return codes
}
