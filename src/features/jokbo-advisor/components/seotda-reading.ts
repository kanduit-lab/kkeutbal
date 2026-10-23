import type { HwatuCard } from '@/features/hwatu/types'
import { evaluateSeotdaHand } from '@/features/seotda/engine'
import { bestSeotdaPair, seotdaPairsOf } from '@/features/seotda/three-card'
import type { SeotdaHand } from '@/features/seotda/types'

export interface SeotdaReading {
  readonly hand: SeotdaHand
  readonly pairs: readonly SeotdaHand[] | null
  readonly bestIndex: number
}

function samePair(a: SeotdaHand, b: SeotdaHand): boolean {
  return a.cards[0].id === b.cards[0].id && a.cards[1].id === b.cards[1].id
}

export function readSeotdaCards(cards: readonly HwatuCard[]): SeotdaReading | null {
  try {
    const [first, second, third] = cards
    if (cards.length === 2 && first && second) {
      return { hand: evaluateSeotdaHand([first, second]), pairs: null, bestIndex: -1 }
    }
    if (cards.length === 3 && first && second && third) {
      const hand = bestSeotdaPair([first, second, third])
      const pairs = seotdaPairsOf([first, second, third])
      return { hand, pairs, bestIndex: pairs.findIndex((pair) => samePair(pair, hand)) }
    }
    return null
  } catch {
    return null
  }
}
