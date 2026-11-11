import type { HwatuCard } from '../hwatu/types'
import { evaluateSeotdaHand } from './engine'
import type { SeotdaHand, SeotdaRules } from './types'

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

/** 세 쌍의 손패 내 위치(0·1·2)를 서열 높은 순으로 정렬한다. 동률은 손패 순서를 지킨다 */
export function seotdaPairOrder(cards: ThreeCardHand): readonly number[] {
  return seotdaPairsOf(cards)
    .map((pair, index) => ({ rank: pair.rank, index }))
    .sort((a, b) => b.rank - a.rank || a.index - b.index)
    .map((entry) => entry.index)
}

/**
 * 서열 순위와 무관하게 합을 뒤집는 잡기 패. 암행어사는 광땡을, 땡잡이는 땡을 이긴다 —
 * `engine.ts`의 대결 판정과 같은 규칙을 보여 주기 위한 표다.
 */
const CATCHER_OF = {
  amhaengeosa: 'gwangttaeng',
  ttaengjabi: 'ttaeng',
} as const

export type SeotdaCatcherTrait = keyof typeof CATCHER_OF

/** 이 쌍이 서열과 무관하게 잡히는 상대 패 분류와, 그 패를 가진 상대를 잡는 패. 없으면 null */
export function catcherOf(
  hand: SeotdaHand,
  rules: SeotdaRules,
): { readonly caught: SeotdaHand['category']; readonly catcher: SeotdaCatcherTrait } | null {
  const caught = hand.category
  if (caught !== 'gwangttaeng' && caught !== 'ttaeng') return null
  const catcher: SeotdaCatcherTrait = caught === 'gwangttaeng' ? 'amhaengeosa' : 'ttaengjabi'
  return rules[catcher] ? { caught, catcher } : null
}

/** 이 쌍이 서열과 무관하게 이기는 상대 패. 그런 능력이 없으면 null */
export function catchingCategory(
  hand: SeotdaHand,
  rules: SeotdaRules,
): SeotdaHand['category'] | null {
  for (const catcher of Object.keys(CATCHER_OF) as SeotdaCatcherTrait[]) {
    if (hand.traits.includes(catcher) && rules[catcher]) return CATCHER_OF[catcher]
  }
  return null
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
