import { describe, expect, it } from 'vitest'
import { findPokerCard, type PokerCard } from './cards'
import { describePokerHand, evaluatePokerHand } from './engine'

function cards(...ids: string[]): PokerCard[] {
  return ids.map((id) => {
    const card = findPokerCard(id)
    if (!card) throw new Error(`테스트 카드 없음: ${id}`)
    return card
  })
}

describe('evaluatePokerHand', () => {
  it.each([
    ['royal-flush', ['TS', 'JS', 'QS', 'KS', 'AS']],
    ['straight-flush', ['5H', '6H', '7H', '8H', '9H']],
    ['four-of-a-kind', ['AS', 'AH', 'AD', 'AC', '2S']],
    ['full-house', ['KS', 'KH', 'KD', '2C', '2D']],
    ['flush', ['2S', '5S', '8S', 'JS', 'KS']],
    ['straight', ['5S', '6H', '7D', '8C', '9S']],
    ['three-of-a-kind', ['QS', 'QH', 'QD', '2C', '9S']],
    ['two-pair', ['JS', 'JH', '4D', '4C', '9S']],
    ['one-pair', ['TS', 'TH', '3D', '6C', 'AS']],
    ['high-card', ['2S', '5H', '8D', 'JC', 'KS']],
  ] as const)('%s 카테고리를 판정한다', (category, ids) => {
    expect(evaluatePokerHand(cards(...ids)).category).toBe(category)
  })

  it('A-2-3-4-5를 5 하이 스트레이트로 취급한다', () => {
    expect(evaluatePokerHand(cards('AS', '2H', '3D', '4C', '5S')).ranks).toEqual([4, 5])
  })

  it('7장 중 최강 5장을 선택하고 키커로 동급을 구분한다', () => {
    const result = evaluatePokerHand(cards('AS', 'AH', 'AD', 'KS', 'KH', '2C', '3D'))
    expect(result.category).toBe('full-house')
    expect(result.ranks).toEqual([6, 14, 13])
    expect(describePokerHand(result)).toContain('A 트리플')
  })

  it('입력 객체 속성을 믿지 않고 표준 덱 id로 정규화한다', () => {
    const forged = { ...cards('AS')[0]!, rank: 2, suit: 'h' as const, label: '위조' }
    expect(evaluatePokerHand([forged, ...cards('KS', 'QS', 'JS', 'TS')]).category).toBe(
      'royal-flush',
    )
  })

  it('카드 수·중복·표준 덱 밖 id를 거부한다', () => {
    expect(() => evaluatePokerHand(cards('AS', 'KS', 'QS', 'JS'))).toThrow(/5~7장/)
    expect(() => evaluatePokerHand(cards('AS', 'AS', 'QS', 'JS', 'TS'))).toThrow(/중복/)
    expect(() =>
      evaluatePokerHand([{ ...cards('AS')[0]!, id: 'ZZ' }, ...cards('KS', 'QS', 'JS', 'TS')]),
    ).toThrow(/표준 덱/)
  })
})
