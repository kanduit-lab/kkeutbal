import { describe, it, expect } from 'vitest'
import { SEOTDA_DECK } from '../hwatu/cards'
import type { HwatuCard } from '../hwatu/types'
import { evaluateSeotdaHand } from './engine'
import { SEOTDA_RULES_STANDARD, type SeotdaRules } from './types'
import { catcherTraitAgainst, seotdaAdvice } from './advice'

function card(month: number, kind: HwatuCard['kind']): HwatuCard {
  const found = SEOTDA_DECK.find((c) => c.month === month && c.kind === kind)
  if (!found) throw new Error(`테스트 카드 없음: ${month}월 ${kind}`)
  return found
}

function ttaeng(month: number) {
  const two = SEOTDA_DECK.filter((c) => c.month === month)
  return evaluateSeotdaHand([two[0] as HwatuCard, two[1] as HwatuCard])
}

const RULES = SEOTDA_RULES_STANDARD
const NO_CATCH: SeotdaRules = { ...RULES, amhaengeosa: false, ttaengjabi: false }

describe('catcherTraitAgainst', () => {
  it('광땡은 암행어사에게 잡힌다', () => {
    const gwang = evaluateSeotdaHand([card(3, 'gwang'), card(8, 'gwang')])
    expect(gwang.category).toBe('gwangttaeng')
    expect(catcherTraitAgainst(gwang, RULES)).toBe('amhaengeosa')
  })

  it('땡은 땡잡이에게 잡힌다', () => {
    expect(catcherTraitAgainst(ttaeng(10), RULES)).toBe('ttaengjabi')
  })

  it('끗은 잡히지 않는다', () => {
    const kkeut = evaluateSeotdaHand([card(2, 'tti'), card(5, 'tti')])
    expect(catcherTraitAgainst(kkeut, RULES)).toBeNull()
  })

  it('룰이 꺼져 있으면 잡히지 않는다', () => {
    const gwang = evaluateSeotdaHand([card(3, 'gwang'), card(8, 'gwang')])
    expect(catcherTraitAgainst(gwang, NO_CATCH)).toBeNull()
    expect(catcherTraitAgainst(ttaeng(10), NO_CATCH)).toBeNull()
  })
})

describe('seotdaAdvice', () => {
  it('구사는 재경기를 가장 먼저 알린다', () => {
    const gusa = evaluateSeotdaHand([card(4, 'yeol'), card(9, 'tti')])
    expect(gusa.traits).toContain('gusa')
    expect(seotdaAdvice(gusa, RULES)[0]).toBe('gusaReplay')
  })

  it('암행어사는 잡는 패로 안내한다', () => {
    const amhaeng = evaluateSeotdaHand([card(4, 'yeol'), card(7, 'yeol')])
    expect(amhaeng.traits).toContain('amhaengeosa')
    expect(seotdaAdvice(amhaeng, RULES)).toContain('amhaengeosaCatches')
  })

  it('광땡은 잡힐 수 있다고 경고한다', () => {
    const gwang = evaluateSeotdaHand([card(3, 'gwang'), card(8, 'gwang')])
    expect(seotdaAdvice(gwang, RULES)).toContain('caughtByAmhaengeosa')
  })

  it('땡은 땡잡이 경고를 받는다', () => {
    expect(seotdaAdvice(ttaeng(10), RULES)).toContain('caughtByTtaengjabi')
  })

  it('38광땡은 암행어사 룰이 꺼져야만 무적이다', () => {
    const gwang38 = evaluateSeotdaHand([card(3, 'gwang'), card(8, 'gwang')])
    expect(seotdaAdvice(gwang38, RULES)).not.toContain('unbeatable')
    expect(seotdaAdvice(gwang38, NO_CATCH)).toContain('unbeatable')
  })

  it('망통은 최하위로 안내한다', () => {
    const mangtong = evaluateSeotdaHand([card(1, 'gwang'), card(9, 'tti')])
    if (mangtong.rank === 600) expect(seotdaAdvice(mangtong, RULES)).toContain('lowest')
  })
})