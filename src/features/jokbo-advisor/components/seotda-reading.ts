import type { HwatuCard } from '@/features/hwatu/types'
import { evaluateSeotdaHand } from '@/features/seotda/engine'
import { bestSeotdaPair, seotdaPairsOf, toThreeCardHand } from '@/features/seotda/three-card'
import type { SeotdaHand } from '@/features/seotda/types'

export interface SeotdaReading {
  /** 대표 패. 두 장이면 그 쌍, 세 장이면 승부에 낼 수 있는 쌍 중 가장 높은 쌍이다 */
  readonly hand: SeotdaHand
  /** 승부에 낼 수 있는 쌍 전부 (서열 높은 순). 두 장이면 1개, 세 장이면 3개 */
  readonly choices: readonly SeotdaHand[]
}

export function isSameSeotdaPair(a: SeotdaHand, b: SeotdaHand): boolean {
  return a.cards[0].id === b.cards[0].id && a.cards[1].id === b.cards[1].id
}

export function readSeotdaCards(cards: readonly HwatuCard[]): SeotdaReading | null {
  try {
    const [first, second] = cards
    if (cards.length === 2 && first && second) {
      const hand = evaluateSeotdaHand([first, second])
      return { hand, choices: [hand] }
    }
    const three = toThreeCardHand(cards)
    if (!three) return null
    const pairs = seotdaPairsOf(three)
    const hand = bestSeotdaPair(three)
    const choices = [...pairs].sort((a, b) => b.rank - a.rank)
    return { hand, choices }
  } catch {
    return null
  }
}
