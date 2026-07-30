import { describe, expect, it } from 'vitest'
import { findPokerCard, type PokerCard } from '@/features/poker/cards'
import { POKER_PREVIEW_MAX_COMBINATIONS, previewPokerHand } from './poker-preview'

function cards(...ids: string[]): PokerCard[] {
  return ids.map((id) => {
    const card = findPokerCard(id)
    if (!card) throw new Error(`테스트 카드 없음: ${id}`)
    return card
  })
}

function categoryCount(
  preview: ReturnType<typeof previewPokerHand>,
  category: string,
): number {
  if (!preview.computed) throw new Error('preview가 계산되지 않았다')
  return preview.categories.find((entry) => entry.category === category)?.count ?? 0
}

describe('previewPokerHand', () => {
  it('1~2장은 계산하지 않는다', () => {
    expect(previewPokerHand(cards('AS'))).toEqual({ computed: false, reason: 'tooFewCards' })
    expect(previewPokerHand(cards('AS', 'KS'))).toEqual({ computed: false, reason: 'tooFewCards' })
  })

  it('5장 이상은 이미 확정 판정 대상이라 계산하지 않는다', () => {
    expect(previewPokerHand(cards('AS', 'AH', 'AD', 'AC', '2S'))).toEqual({
      computed: false,
      reason: 'alreadyComplete',
    })
  })

  it('3장 보유 시 남은 49장에서 2장 뽑는 1,176가지 조합을 전부 평가한다', () => {
    // 트리플 에이스(A♠A♥A♦) — 4번째 에이스(A♣)를 뽑으면 무조건 포카드,
    // 나머지 48장 중 같은 숫자 페어를 뽑으면 풀하우스, 그 외는 트리플로 남는다.
    const preview = previewPokerHand(cards('AS', 'AH', 'AD'))
    expect(preview.computed).toBe(true)
    if (!preview.computed) return

    expect(preview.totalCombinations).toBe(1176)
    expect(categoryCount(preview, 'four-of-a-kind')).toBe(48)
    expect(categoryCount(preview, 'full-house')).toBe(72)
    expect(categoryCount(preview, 'three-of-a-kind')).toBe(1056)

    const countSum = preview.categories.reduce((sum, entry) => sum + entry.count, 0)
    expect(countSum).toBe(1176)
    const probabilitySum = preview.categories.reduce((sum, entry) => sum + entry.probability, 0)
    expect(probabilitySum).toBeCloseTo(1, 10)
  })

  it('4장 보유 시 남은 48장에서 1장 뽑는 48가지 조합을 전부 평가한다', () => {
    // 포카드가 이미 완성돼 있으니 어떤 5번째 카드를 뽑아도 포카드로 남는다.
    const preview = previewPokerHand(cards('AS', 'AH', 'AD', 'AC'))
    expect(preview.computed).toBe(true)
    if (!preview.computed) return

    expect(preview.totalCombinations).toBe(48)
    expect(categoryCount(preview, 'four-of-a-kind')).toBe(48)
    expect(preview.categories.every((entry) => entry.category === 'four-of-a-kind' || entry.count === 0)).toBe(
      true,
    )
  })

  it('확률은 등장한 조합 수를 전체 조합 수로 나눈 값이다', () => {
    const preview = previewPokerHand(cards('AS', 'AH', 'AD', 'AC'))
    expect(preview.computed).toBe(true)
    if (!preview.computed) return
    const fourOfAKind = preview.categories.find((entry) => entry.category === 'four-of-a-kind')
    expect(fourOfAKind?.probability).toBe(1)
  })

  it('상한이 실제 최대 조합 수(1,176)보다 넉넉하다', () => {
    // held.length는 3~4로만 호출되므로(그 외는 계산 자체를 건너뛴다),
    // 실제 조합 수는 언제나 1,176(3장 보유) 이하다 — 이 상한은 그 값보다
    // 넉넉히 높게 잡아, 향후 호출 조건이 바뀌어도 안전선 역할을 하게 한다.
    expect(POKER_PREVIEW_MAX_COMBINATIONS).toBeGreaterThan(1176)
  })
})
