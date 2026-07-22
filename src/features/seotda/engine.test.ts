import { describe, expect, it } from 'vitest'
import { SEOTDA_RANK, SEOTDA_SPECIALS, SEOTDA_TRAIT_COMBOS } from './types'

/**
 * Phase 1 (docs/09-roadmap.md) 착수 전 테스트 계약.
 *
 * `it.todo` 항목은 구현과 함께 채운다. 190조합 전수 기대값은 사람이 작성한
 * `seotda.fixtures.ts` 를 소스로 삼는다 — 엔진 출력으로 생성하지 않는다.
 */

describe('섯다 서열 상수', () => {
  it('광땡 > 땡 > 특수 > 끗 순으로 구간이 분리돼 있다', () => {
    const maxTtaeng = SEOTDA_RANK.TTAENG_BASE + 10 * 10 // 장땡
    const maxSpecial = SEOTDA_RANK.ALLI
    const maxKkeut = SEOTDA_RANK.KKEUT_BASE + 9 // 갑오

    expect(SEOTDA_RANK.GWANGTTAENG_13).toBeGreaterThan(maxTtaeng)
    expect(maxTtaeng).toBeGreaterThan(maxSpecial)
    expect(SEOTDA_RANK.SERYUK).toBeGreaterThan(maxKkeut)
  })

  it('광땡 서열은 38 > 18 > 13 이다', () => {
    expect(SEOTDA_RANK.GWANGTTAENG_38).toBeGreaterThan(SEOTDA_RANK.GWANGTTAENG_18)
    expect(SEOTDA_RANK.GWANGTTAENG_18).toBeGreaterThan(SEOTDA_RANK.GWANGTTAENG_13)
  })

  it('특수 족보 서열은 알리 > 독사 > 구삥 > 장삥 > 장사 > 세륙 이다', () => {
    const labels = [...SEOTDA_SPECIALS]
      .sort((a, b) => b.rank - a.rank)
      .map((special) => special.label)
    expect(labels).toEqual(['알리', '독사', '구삥', '장삥', '장사', '세륙'])
  })

  it('특수 족보 조합에 중복이 없다', () => {
    const keys = new Set(SEOTDA_SPECIALS.map((s) => s.months.join('-')))
    expect(keys.size).toBe(SEOTDA_SPECIALS.length)
  })

  it('판정패는 암행어사·땡잡이·구사 3종이다', () => {
    expect(SEOTDA_TRAIT_COMBOS.map((c) => c.trait).sort()).toEqual([
      'amhaengeosa',
      'gusa',
      'ttaengjabi',
    ])
  })
})

describe('evaluateSeotdaHand', () => {
  it.todo('같은 월 2장을 땡으로 판정한다 (장땡 ~ 1땡)')
  it.todo('1·3월 광 조합을 13광땡으로 판정한다')
  it.todo('1·8월 광 조합을 18광땡으로 판정한다')
  it.todo('3·8월 광 조합을 38광땡으로 판정한다')
  it.todo('특수 조합 6종을 각 label 로 판정한다')
  it.todo('나머지는 월 합의 일의 자리를 끗으로 판정한다')
  it.todo('9끗을 갑오로, 0끗을 망통으로 표기한다')
  it.todo('190개 조합 전부가 기대값 테이블과 일치한다')
  it.todo('덱에 없는 카드가 들어오면 오류를 던진다')
  it.todo('같은 카드 2장이 들어오면 오류를 던진다')
})

describe('resolveSeotdaShowdown', () => {
  it.todo('rank 가 가장 높은 손패가 이긴다')
  it.todo('암행어사가 광땡을 잡는다 (rules.amhaengeosa = true)')
  it.todo('rules.amhaengeosa = false 면 암행어사가 효력이 없다')
  it.todo('땡잡이가 땡을 잡는다')
  it.todo('땡잡이는 광땡을 잡지 못한다')
  it.todo('구사 보유 시 replay 를 반환한다')
  it.todo('동급 족보는 tieBreak 설정에 따라 replay 또는 dealer-wins 로 처리된다')
  it.todo('판정패 룰을 모두 끄면 순수 rank 비교로만 결정된다')
})
