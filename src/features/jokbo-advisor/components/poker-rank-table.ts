import { POKER_CATEGORY_LABEL, POKER_CATEGORY_PRIORITY } from '@/features/poker/engine'
import type { PokerCategory } from '@/features/poker/engine'

export interface PokerRankTier {
  readonly rank: number
  readonly label: string
  readonly category: PokerCategory
}

function buildRankTable(): readonly PokerRankTier[] {
  return (Object.keys(POKER_CATEGORY_PRIORITY) as readonly PokerCategory[])
    .map((category) => ({
      rank: POKER_CATEGORY_PRIORITY[category],
      label: POKER_CATEGORY_LABEL[category],
      category,
    }))
    .sort((a, b) => b.rank - a.rank)
}

export const POKER_RANK_TABLE: readonly PokerRankTier[] = buildRankTable()
