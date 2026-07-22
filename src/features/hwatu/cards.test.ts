import { describe, expect, it } from 'vitest'
import { HWATU_DECK, SEOTDA_DECK, cardsOfMonth, findCard } from './cards'

describe('화투 덱 구성', () => {
  it('총 48장이다', () => {
    expect(HWATU_DECK).toHaveLength(48)
  })

  it('id 가 중복되지 않는다', () => {
    const ids = new Set(HWATU_DECK.map((card) => card.id))
    expect(ids.size).toBe(48)
  })

  it('모든 월이 정확히 4장씩이다', () => {
    for (let month = 1; month <= 12; month += 1) {
      expect(cardsOfMonth(month as never)).toHaveLength(4)
    }
  })

  it('광은 1·3·8·11·12월 5장이다', () => {
    const gwang = HWATU_DECK.filter((card) => card.kind === 'gwang')
    expect(gwang.map((card) => card.month).sort((a, b) => a - b)).toEqual([1, 3, 8, 11, 12])
  })

  it('열끗 9장 · 띠 10장 · 피 24장이다', () => {
    const count = (kind: string) => HWATU_DECK.filter((card) => card.kind === kind).length
    expect(count('yeol')).toBe(9)
    expect(count('tti')).toBe(10)
    expect(count('pi')).toBe(24)
  })

  it('고도리는 2·4·8월 3장이다', () => {
    const godori = HWATU_DECK.filter((card) => card.isGodori)
    expect(godori.map((card) => card.month).sort((a, b) => a - b)).toEqual([2, 4, 8])
  })

  it('홍단·청단·초단이 각 3장이다', () => {
    const count = (tti: string) => HWATU_DECK.filter((card) => card.tti === tti).length
    expect(count('hong')).toBe(3)
    expect(count('cheong')).toBe(3)
    expect(count('cho')).toBe(3)
  })

  it('쌍피는 11·12월 2장이다', () => {
    const ssangpi = HWATU_DECK.filter((card) => card.piValue === 2)
    expect(ssangpi.map((card) => card.month).sort((a, b) => a - b)).toEqual([11, 12])
  })

  it('피 환산 총합이 26이다', () => {
    const total = HWATU_DECK.reduce((sum, card) => sum + card.piValue, 0)
    expect(total).toBe(26)
  })
})

describe('섯다 덱', () => {
  it('20장이다', () => {
    expect(SEOTDA_DECK).toHaveLength(20)
  })

  it('1~10월만 포함한다', () => {
    expect(SEOTDA_DECK.every((card) => card.month <= 10)).toBe(true)
  })

  it('월마다 정확히 2장이다', () => {
    for (let month = 1; month <= 10; month += 1) {
      expect(SEOTDA_DECK.filter((card) => card.month === month)).toHaveLength(2)
    }
  })

  it('피를 포함하지 않는다', () => {
    expect(SEOTDA_DECK.some((card) => card.kind === 'pi')).toBe(false)
  })

  it('1·3·8월 광을 포함한다 — 광땡 조합의 전제', () => {
    const gwangMonths = SEOTDA_DECK.filter((card) => card.kind === 'gwang').map((c) => c.month)
    expect(gwangMonths.sort((a, b) => a - b)).toEqual([1, 3, 8])
  })
})

describe('findCard', () => {
  it('존재하는 id 를 찾는다', () => {
    const first = HWATU_DECK[0]
    expect(first).toBeDefined()
    expect(findCard(first!.id)).toEqual(first)
  })

  it('없는 id 는 undefined 를 반환한다 — 외부 입력 정규화 경로', () => {
    expect(findCard('99-gwang')).toBeUndefined()
  })
})
