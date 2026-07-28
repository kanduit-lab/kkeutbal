import { SEOTDA_DECK } from '@/features/hwatu/cards'
import type { HwatuCard } from '@/features/hwatu/types'
import { evaluateSeotdaHand } from '@/features/seotda/engine'
import type { SeotdaCategory } from '@/features/seotda/types'

export interface SeotdaRankTier {
  readonly rank: number
  readonly label: string
  readonly category: SeotdaCategory
}

function buildRankTable(): readonly SeotdaRankTier[] {
  const seen = new Map<number, SeotdaRankTier>()
  for (let i = 0; i < SEOTDA_DECK.length; i += 1) {
    for (let j = i + 1; j < SEOTDA_DECK.length; j += 1) {
      const hand = evaluateSeotdaHand([SEOTDA_DECK[i] as HwatuCard, SEOTDA_DECK[j] as HwatuCard])
      if (!seen.has(hand.rank)) {
        seen.set(hand.rank, { rank: hand.rank, label: hand.label, category: hand.category })
      }
    }
  }
  return [...seen.values()].sort((a, b) => b.rank - a.rank)
}

export const SEOTDA_RANK_TABLE: readonly SeotdaRankTier[] = buildRankTable()