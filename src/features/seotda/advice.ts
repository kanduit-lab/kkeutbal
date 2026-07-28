import { SEOTDA_RANK, type SeotdaHand, type SeotdaRules, type SeotdaTrait } from './types'

export type SeotdaAdviceCode =
  | 'gusaReplay'
  | 'amhaengeosaCatches'
  | 'ttaengjabiCatches'
  | 'caughtByAmhaengeosa'
  | 'caughtByTtaengjabi'
  | 'unbeatable'
  | 'lowest'

export function catcherTraitAgainst(hand: SeotdaHand, rules: SeotdaRules): SeotdaTrait | null {
  if (hand.category === 'gwangttaeng' && rules.amhaengeosa) return 'amhaengeosa'
  if (hand.category === 'ttaeng' && rules.ttaengjabi) return 'ttaengjabi'
  return null
}

export function seotdaAdvice(hand: SeotdaHand, rules: SeotdaRules): readonly SeotdaAdviceCode[] {
  const codes: SeotdaAdviceCode[] = []

  if (rules.gusa && hand.traits.includes('gusa')) codes.push('gusaReplay')

  if (rules.amhaengeosa && hand.traits.includes('amhaengeosa')) codes.push('amhaengeosaCatches')
  if (rules.ttaengjabi && hand.traits.includes('ttaengjabi')) codes.push('ttaengjabiCatches')

  const catcher = catcherTraitAgainst(hand, rules)
  if (catcher === 'amhaengeosa') codes.push('caughtByAmhaengeosa')
  if (catcher === 'ttaengjabi') codes.push('caughtByTtaengjabi')

  if (hand.rank === SEOTDA_RANK.GWANGTTAENG_38 && catcher === null) codes.push('unbeatable')
  if (hand.rank === SEOTDA_RANK.KKEUT_BASE) codes.push('lowest')

  return codes
}