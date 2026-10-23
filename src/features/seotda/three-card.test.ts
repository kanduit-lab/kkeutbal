import { describe, expect, it } from 'vitest'
import { findCard } from '../hwatu/cards'
import type { HwatuCard } from '../hwatu/types'
import { bestSeotdaPair, chosenSeotdaPair, seotdaPairsOf, type ThreeCardHand } from './three-card'

function hand(...ids: [string, string, string]): ThreeCardHand {
  return ids.map((id) => {
    const card = findCard(id)
    if (!card) throw new Error(`unknown card ${id}`)
    return card
  }) as unknown as readonly [HwatuCard, HwatuCard, HwatuCard]
}

describe('three card seotda', () => {
  it('evaluates all three pairs', () => {
    expect(seotdaPairsOf(hand('03-gwang', '08-gwang', '05-tti')).map((p) => p.label)).toEqual([
      '38광땡',
      '8끗',
      '3끗',
    ])
  })

  it('picks the highest ranked pair', () => {
    expect(bestSeotdaPair(hand('05-tti', '03-gwang', '08-gwang')).label).toBe('38광땡')
    expect(bestSeotdaPair(hand('04-yeol', '07-yeol', '07-tti')).label).toBe('7땡')
  })

  it('keeps the catcher trait only when that pair is chosen', () => {
    const cards = hand('03-gwang', '07-yeol', '02-tti')
    expect(chosenSeotdaPair(cards, ['03-gwang', '07-yeol'])?.traits).toContain('ttaengjabi')
    expect(bestSeotdaPair(cards).traits).not.toContain('ttaengjabi')
  })

  it('rejects a choice outside the hand or a repeated card', () => {
    const cards = hand('01-gwang', '02-tti', '03-gwang')
    expect(chosenSeotdaPair(cards, ['01-gwang', '04-tti'])).toBeNull()
    expect(chosenSeotdaPair(cards, ['01-gwang', '01-gwang'])).toBeNull()
    expect(chosenSeotdaPair(cards, ['01-gwang'])).toBeNull()
  })
})
