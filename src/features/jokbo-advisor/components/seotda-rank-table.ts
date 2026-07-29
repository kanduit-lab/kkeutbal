import { SEOTDA_DECK } from '@/features/hwatu/cards'
import type { HwatuCard } from '@/features/hwatu/types'
import { evaluateSeotdaHand } from '@/features/seotda/engine'
import type { SeotdaCategory } from '@/features/seotda/types'

export type SeotdaRankDetail =
  | { readonly kind: 'gwang'; readonly months: readonly [number, number] }
  | { readonly kind: 'pair'; readonly month: number }
  | { readonly kind: 'months'; readonly months: readonly [number, number] }

export interface SeotdaRankTier {
  readonly rank: number
  readonly label: string
  readonly category: SeotdaCategory
  /** 대표 카드 조합 (끗·특수패는 여러 조합 중 하나) — 화면 표기는 i18n에서 포맷 */
  readonly detail: SeotdaRankDetail
}

function detailFor(category: SeotdaCategory, a: HwatuCard, b: HwatuCard): SeotdaRankDetail {
  if (category === 'gwangttaeng') return { kind: 'gwang', months: [a.month, b.month] }
  if (category === 'ttaeng') return { kind: 'pair', month: a.month }
  return { kind: 'months', months: [a.month, b.month] }
}

function buildRankTable(): readonly SeotdaRankTier[] {
  const seen = new Map<number, SeotdaRankTier>()
  for (let i = 0; i < SEOTDA_DECK.length; i += 1) {
    for (let j = i + 1; j < SEOTDA_DECK.length; j += 1) {
      const a = SEOTDA_DECK[i] as HwatuCard
      const b = SEOTDA_DECK[j] as HwatuCard
      const hand = evaluateSeotdaHand([a, b])
      if (!seen.has(hand.rank)) {
        seen.set(hand.rank, {
          rank: hand.rank,
          label: hand.label,
          category: hand.category,
          detail: detailFor(hand.category, a, b),
        })
      }
    }
  }
  return [...seen.values()].sort((a, b) => b.rank - a.rank)
}

export const SEOTDA_RANK_TABLE: readonly SeotdaRankTier[] = buildRankTable()