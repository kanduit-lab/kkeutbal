import type { HwatuCard } from '../hwatu/types'
import { evaluateSeotdaHand } from './engine'
import type { SeotdaHand } from './types'

export type ThreeCardHand = readonly [HwatuCard, HwatuCard, HwatuCard]

const PAIR_INDEXES: ReadonlyArray<readonly [0 | 1 | 2, 0 | 1 | 2]> = [
  [0, 1],
  [0, 2],
  [1, 2],
]

export function toThreeCardHand(cards: readonly HwatuCard[]): ThreeCardHand | null {
  const [first, second, third] = cards
  return cards.length === 3 && first && second && third ? [first, second, third] : null
}

/** 세 장에서 나오는 세 쌍을 손패 순서대로 평가한다 */
export function seotdaPairsOf(cards: ThreeCardHand): readonly SeotdaHand[] {
  return PAIR_INDEXES.map(([a, b]) => evaluateSeotdaHand([cards[a], cards[b]]))
}

/** 세 쌍 중 rank가 가장 높은 쌍. 동률이면 손패 순서상 앞선 쌍이다 */
export function bestSeotdaPair(cards: ThreeCardHand): SeotdaHand {
  const pairs = seotdaPairsOf(cards)
  return pairs.reduce((best, pair) => (pair.rank > best.rank ? pair : best))
}

/** 고른 두 장이 이 손패 안의 서로 다른 두 장이면 그 쌍을, 아니면 null을 돌려준다 */
export function chosenSeotdaPair(
  cards: ThreeCardHand,
  chosenIds: readonly string[],
): SeotdaHand | null {
  if (chosenIds.length !== 2 || chosenIds[0] === chosenIds[1]) return null
  const picked = chosenIds.map((id) => cards.find((card) => card.id === id))
  const [first, second] = picked
  if (!first || !second) return null
  return evaluateSeotdaHand([first, second])
}
