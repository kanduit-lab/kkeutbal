import { describe, expect, it } from 'vitest'
import { SEOTDA_DECK } from '../hwatu/cards'
import type { HwatuCard } from '../hwatu/types'
import { evaluateSeotdaHand, resolveSeotdaShowdown } from './engine'
import {
  SEOTDA_RANK,
  SEOTDA_RULES_STANDARD,
  SEOTDA_SPECIALS,
  SEOTDA_TRAIT_COMBOS,
  type SeotdaRules,
} from './types'

function card(month: number, kind: HwatuCard['kind']): HwatuCard {
  const found = SEOTDA_DECK.find((entry) => entry.month === month && entry.kind === kind)
  if (!found) throw new Error(`테스트 카드 없음: ${month}/${kind}`)
  return found
}

function hand(aMonth: number, aKind: HwatuCard['kind'], bMonth: number, bKind: HwatuCard['kind']) {
  return evaluateSeotdaHand([card(aMonth, aKind), card(bMonth, bKind)])
}

function ttaeng(month: number) {
  const cards = SEOTDA_DECK.filter((entry) => entry.month === month)
  return evaluateSeotdaHand([cards[0]!, cards[1]!])
}

const NO_SPECIALS: SeotdaRules = {
  ...SEOTDA_RULES_STANDARD,
  amhaengeosa: false,
  ttaengjabi: false,
  gusa: false,
}

describe('섯다 서열 상수', () => {
  it('광땡 > 땡 > 특수 > 끗 순으로 구간이 분리돼 있다', () => {
    expect(SEOTDA_RANK.GWANGTTAENG_13).toBeGreaterThan(SEOTDA_RANK.TTAENG_BASE + 100)
    expect(SEOTDA_RANK.TTAENG_BASE + 10).toBeGreaterThan(SEOTDA_RANK.ALLI)
    expect(SEOTDA_RANK.SERYUK).toBeGreaterThan(SEOTDA_RANK.KKEUT_BASE + 9)
  })

  it('특수 족보와 판정 trait 정의에 중복이 없다', () => {
    expect(new Set(SEOTDA_SPECIALS.map((entry) => entry.months.join('-'))).size).toBe(
      SEOTDA_SPECIALS.length,
    )
    expect(SEOTDA_TRAIT_COMBOS.map((entry) => entry.trait).sort()).toEqual([
      'amhaengeosa',
      'gusa',
      'ttaengjabi',
    ])
  })
})

describe('evaluateSeotdaHand', () => {
  it('광땡·땡·특수·갑오·망통을 판정한다', () => {
    expect(hand(1, 'gwang', 3, 'gwang').label).toBe('13광땡')
    expect(hand(1, 'gwang', 8, 'gwang').label).toBe('18광땡')
    expect(hand(3, 'gwang', 8, 'gwang').label).toBe('38광땡')
    expect(ttaeng(10).label).toBe('장땡')
    expect(hand(1, 'tti', 2, 'tti').label).toBe('알리')
    expect(hand(1, 'gwang', 8, 'yeol').label).toBe('갑오')
    expect(hand(2, 'tti', 8, 'yeol').label).toBe('망통')
  })

  it('20장 중 2장인 190조합이 독립 규칙표와 전부 일치한다', () => {
    let count = 0
    for (let i = 0; i < SEOTDA_DECK.length; i += 1) {
      for (let j = i + 1; j < SEOTDA_DECK.length; j += 1) {
        const a = SEOTDA_DECK[i]!
        const b = SEOTDA_DECK[j]!
        const result = evaluateSeotdaHand([a, b])
        const months = [a.month, b.month].sort((x, y) => x - y)
        const key = `${months[0]}-${months[1]}`

        if (a.kind === 'gwang' && b.kind === 'gwang') {
          const expected = new Map([
            ['1-3', ['13광땡', SEOTDA_RANK.GWANGTTAENG_13]],
            ['1-8', ['18광땡', SEOTDA_RANK.GWANGTTAENG_18]],
            ['3-8', ['38광땡', SEOTDA_RANK.GWANGTTAENG_38]],
          ]).get(key)
          expect([result.label, result.rank]).toEqual(expected)
        } else if (a.month === b.month) {
          expect(result.category).toBe('ttaeng')
          expect(result.rank).toBe(SEOTDA_RANK.TTAENG_BASE + a.month * 10)
        } else {
          const special = SEOTDA_SPECIALS.find((entry) => entry.months.join('-') === key)
          if (special) {
            expect([result.label, result.rank]).toEqual([special.label, special.rank])
          } else {
            const kkeut = (a.month + b.month) % 10
            expect(result.rank).toBe(SEOTDA_RANK.KKEUT_BASE + kkeut)
          }
        }
        count += 1
      }
    }
    expect(count).toBe(190)
  })

  it('암행어사는 열끗+열끗만, 땡잡이·구사는 월 조합으로 표시한다', () => {
    expect(hand(4, 'yeol', 7, 'yeol').traits).toContain('amhaengeosa')
    expect(hand(4, 'tti', 7, 'yeol').traits).not.toContain('amhaengeosa')
    expect(hand(3, 'tti', 7, 'tti').traits).toContain('ttaengjabi')
    expect(hand(4, 'tti', 9, 'tti').traits).toContain('gusa')
  })

  it('덱 밖 카드·같은 카드를 거부하고 정본 속성으로 다시 계산한다', () => {
    const canonical = card(1, 'gwang')
    const forged = { ...canonical, month: 10 as const, kind: 'yeol' as const, label: '위조' }
    expect(evaluateSeotdaHand([forged, card(3, 'gwang')]).label).toBe('13광땡')
    expect(() =>
      evaluateSeotdaHand([{ ...canonical, id: 'fake' }, card(3, 'gwang')]),
    ).toThrow(/없는 카드/)
    expect(() => evaluateSeotdaHand([canonical, canonical])).toThrow(/같은 카드/)
  })
})

describe('resolveSeotdaShowdown', () => {
  it('순수 서열과 동률 처리 규칙을 적용한다', () => {
    expect(resolveSeotdaShowdown([ttaeng(10), ttaeng(1)], NO_SPECIALS)).toMatchObject({
      kind: 'win',
      winnerIndex: 0,
    })
    const tied = [hand(2, 'yeol', 5, 'yeol'), hand(3, 'tti', 4, 'tti')]
    expect(resolveSeotdaShowdown(tied, NO_SPECIALS).kind).toBe('replay')
    expect(
      resolveSeotdaShowdown(tied, { ...NO_SPECIALS, tieBreak: 'dealer-wins' }),
    ).toMatchObject({ kind: 'win', winnerIndex: 0 })
  })

  it('암행어사·땡잡이·구사를 룰 토글에 따라 적용한다', () => {
    const amhaeng = hand(4, 'yeol', 7, 'yeol')
    const gwang = hand(3, 'gwang', 8, 'gwang')
    expect(resolveSeotdaShowdown([gwang, amhaeng], SEOTDA_RULES_STANDARD)).toMatchObject({
      kind: 'win',
      winnerIndex: 1,
    })
    expect(
      resolveSeotdaShowdown([gwang, amhaeng], {
        ...SEOTDA_RULES_STANDARD,
        amhaengeosa: false,
      }),
    ).toMatchObject({ kind: 'win', winnerIndex: 0 })

    const catcher = hand(3, 'tti', 7, 'tti')
    expect(resolveSeotdaShowdown([ttaeng(10), catcher], SEOTDA_RULES_STANDARD)).toMatchObject({
      kind: 'win',
      winnerIndex: 1,
    })
    expect(resolveSeotdaShowdown([gwang, catcher], SEOTDA_RULES_STANDARD)).toMatchObject({
      kind: 'win',
      winnerIndex: 0,
    })
    expect(
      resolveSeotdaShowdown(
        [ttaeng(10), hand(4, 'tti', 9, 'tti')],
        SEOTDA_RULES_STANDARD,
      ).kind,
    ).toBe('replay')
  })

  it('전달받은 rank·traits 위조를 무시하고 카드에서 다시 계산한다', () => {
    const weak = hand(2, 'yeol', 5, 'yeol')
    const forged = { ...weak, rank: 999_999, traits: ['gusa' as const], label: '위조' }
    expect(resolveSeotdaShowdown([ttaeng(10), forged], NO_SPECIALS)).toMatchObject({
      kind: 'win',
      winnerIndex: 0,
    })
  })

  it('두 손 미만과 손패 사이 중복 카드를 거부한다', () => {
    const first = hand(1, 'gwang', 2, 'yeol')
    const second = hand(1, 'gwang', 3, 'tti')
    expect(() => resolveSeotdaShowdown([first], NO_SPECIALS)).toThrow(/2개 이상/)
    expect(() => resolveSeotdaShowdown([first, second], NO_SPECIALS)).toThrow(/중복 카드/)
  })
})
