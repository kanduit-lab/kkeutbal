import { describe, expect, it } from 'vitest'
import { findCard } from '@/features/hwatu/cards'
import type { HwatuCard } from '@/features/hwatu/types'
import { SEOTDA_RULES_STANDARD } from '@/features/seotda/types'
import { readBestFlip, readSeotdaCombined } from './seotda-combined'
import { seotdaTierPosition } from './seotda-rank-table'
import { readSeotdaCards } from './seotda-reading'

function cards(...ids: string[]): readonly HwatuCard[] {
  return ids.map((id) => {
    const card = findCard(id)
    if (!card) throw new Error(`unknown card ${id}`)
    return card
  })
}

const TIER = seotdaTierPosition

describe('readSeotdaCards', () => {
  it('세 장을 세 쌍 모두 서열 높은 순으로 돌려준다', () => {
    const reading = readSeotdaCards(cards('05-tti', '03-gwang', '08-gwang'))
    expect(reading?.choices.map((pair) => pair.label)).toEqual(['38광땡', '8끗', '3끗'])
    expect(reading?.hand.label).toBe('38광땡')
  })

  it('두 장이면 쌍 하나만 돌려준다', () => {
    const reading = readSeotdaCards(cards('04-yeol', '07-yeol'))
    expect(reading?.choices.map((pair) => pair.label)).toEqual(['1끗'])
    expect(reading?.hand.label).toBe('1끗')
  })
})

describe('readSeotdaCombined', () => {
  it('세 쌍 중 서열이 낮아도 뒤집는 패를 짚는다', () => {
    const reading = readSeotdaCards(cards('03-gwang', '07-yeol', '02-tti'))
    if (!reading) throw new Error('reading 없음')
    const combined = readSeotdaCombined(reading, SEOTDA_RULES_STANDARD, TIER)
    const catchers = combined.choices.filter((choice) =>
      choice.flips.some((flip) => flip.dir === 'catches'),
    )
    expect(catchers.map((choice) => choice.pair.label)).toEqual(['망통'])
    expect(catchers[0]?.isBest).toBe(false)
  })

  it('4·7 열끗 열끗(1끗)은 광땡을 잡는다고 알린다', () => {
    const reading = readSeotdaCards(cards('04-yeol', '07-yeol', '02-tti'))
    if (!reading) throw new Error('reading 없음')
    expect(reading.hand.label).toBe('갑오')
    const combined = readSeotdaCombined(reading, SEOTDA_RULES_STANDARD, TIER)
    const withTrait = combined.choices.find((choice) =>
      choice.flips.some((flip) => flip.dir === 'catches'),
    )
    expect(withTrait?.pair.label).toBe('1끗')
    expect(withTrait).toMatchObject({
      isBest: false,
      flips: [{ dir: 'catches', catcher: 'amhaengeosa', category: 'gwangttaeng' }],
    })
  })

  it('광땡은 암행어사에게 잡힌다고 알린다', () => {
    const reading = readSeotdaCards(cards('03-gwang', '08-gwang', '05-tti'))
    if (!reading) throw new Error('reading 없음')
    expect(readBestFlip(reading, SEOTDA_RULES_STANDARD, TIER)).toMatchObject({
      dir: 'caught',
      catcher: 'amhaengeosa',
    })
  })

  it('끗만 있으면 뒤집힘이 없다', () => {
    const reading = readSeotdaCards(cards('02-tti', '05-tti', '06-tti'))
    if (!reading) throw new Error('reading 없음')
    expect(readBestFlip(reading, SEOTDA_RULES_STANDARD, TIER)).toBeNull()
  })
})
