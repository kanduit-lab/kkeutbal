import { POKER_DECK } from '@/features/poker/cards'
import type { PokerCard } from '@/features/poker/cards'
import { evaluatePokerHand, POKER_CATEGORY_PRIORITY } from '@/features/poker/engine'
import type { PokerCategory } from '@/features/poker/engine'

/**
 * 남은 덱에서 순회할 조합 수의 상한. `docs/12-handoff.md` 2번의 실측표 기준
 * 3장 보유(2장 필요)는 1,176조합·약 5ms, 4장 보유(1장 필요)는 48조합이다.
 * 이 함수는 held.length가 3~4일 때만 계산하므로 실제로는 이 상한을 넘을 수 없지만,
 * 호출 조건이 나중에 느슨해지더라도 메인 스레드를 막지 않도록 넉넉한 안전선을 둔다.
 */
export const POKER_PREVIEW_MAX_COMBINATIONS = 2_000

export interface PokerPreviewCategoryStat {
  readonly category: PokerCategory
  readonly count: number
  readonly probability: number
}

export type PokerHandPreview =
  | {
      readonly computed: true
      readonly totalCombinations: number
      readonly categories: readonly PokerPreviewCategoryStat[]
    }
  | {
      readonly computed: false
      readonly reason: 'tooFewCards' | 'alreadyComplete' | 'tooManyCombinations'
    }

function combinationsOf(items: readonly PokerCard[], size: number): readonly (readonly PokerCard[])[] {
  const result: PokerCard[][] = []

  function pick(start: number, chosen: readonly PokerCard[]): void {
    if (chosen.length === size) {
      result.push([...chosen])
      return
    }
    for (let i = start; i < items.length; i += 1) {
      const card = items[i]
      if (card === undefined) continue
      pick(i + 1, [...chosen, card])
    }
  }

  pick(0, [])
  return result
}

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  let result = 1
  for (let i = 0; i < k; i += 1) {
    result = (result * (n - i)) / (i + 1)
  }
  return Math.round(result)
}

/**
 * 3~4장을 들고 있을 때, 남은 덱에서 뽑을 수 있는 모든 조합을 평가해 완성 가능한
 * 족보별 확률을 계산한다.
 *
 * 1~2장은 계산하지 않는다 — `docs/12-handoff.md` 2번에서 합의된 방향이다.
 * 5장 이상은 `evaluatePokerHand`로 이미 확정 판정할 수 있으므로 이 함수의 대상이 아니다.
 */
export function previewPokerHand(held: readonly PokerCard[]): PokerHandPreview {
  if (held.length < 3) return { computed: false, reason: 'tooFewCards' }
  if (held.length >= 5) return { computed: false, reason: 'alreadyComplete' }

  const heldIds = new Set(held.map((card) => card.id))
  const remaining = POKER_DECK.filter((card) => !heldIds.has(card.id))
  const needed = 5 - held.length

  const totalCombinations = choose(remaining.length, needed)
  if (totalCombinations > POKER_PREVIEW_MAX_COMBINATIONS) {
    return { computed: false, reason: 'tooManyCombinations' }
  }

  const counts = new Map<PokerCategory, number>()
  for (const combo of combinationsOf(remaining, needed)) {
    const category = evaluatePokerHand([...held, ...combo]).category
    counts.set(category, (counts.get(category) ?? 0) + 1)
  }

  const categories = (Object.keys(POKER_CATEGORY_PRIORITY) as readonly PokerCategory[])
    .map((category) => {
      const count = counts.get(category) ?? 0
      return { category, count, probability: count / totalCombinations }
    })
    .sort((a, b) => b.count - a.count)

  return { computed: true, totalCombinations, categories }
}
