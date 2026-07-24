import { describe, expect, it } from 'vitest'
import { findCard, HWATU_DECK } from '../hwatu/cards'
import type { HwatuCard } from '../hwatu/types'
import { captureOf, hasChongtong, scoreGostop } from './scoring'
import { GOSTOP_RULES_STANDARD } from './types'

function cards(...ids: string[]): HwatuCard[] {
  return ids.map((id) => {
    const card = findCard(id)
    if (!card) throw new Error(`테스트 카드 없음: ${id}`)
    return card
  })
}

function capture(ids: readonly string[]) {
  return captureOf(cards(...ids), GOSTOP_RULES_STANDARD)
}

const EMPTY_CONTEXT = { goCount: 0, shakeCount: 0, bombCount: 0, opponents: [] }

describe('captureOf / hasChongtong', () => {
  it('카드를 분류하고 쌍피 환산값을 합한다', () => {
    const result = capture(['01-gwang', '02-yeol', '03-tti', '11-pi-1', '12-pi'])
    expect([result.gwang.length, result.yeol.length, result.tti.length]).toEqual([1, 1, 1])
    expect(result.piValue).toBe(4)
  })

  it('국진은 기본 점수가 더 높은 분류를 택하고 동점이면 쌍피를 택한다', () => {
    const result = capture(['09-yeol', '01-pi-1', '01-pi-2', '02-pi-1', '02-pi-2'])
    expect(result.pi.map((card) => card.id)).toContain('09-yeol')
    expect(result.piValue).toBe(6)
  })

  it('같은 월의 서로 다른 4장만 총통으로 인정한다', () => {
    expect(hasChongtong(HWATU_DECK.filter((card) => card.month === 1))).toBe(true)
    const one = cards('01-gwang')[0]!
    expect(() => hasChongtong([one, one, one, one])).toThrow(/중복/)
  })

  it('덱 밖 카드와 위조 속성을 각각 거부·정규화한다', () => {
    const canonical = cards('01-gwang')[0]!
    expect(captureOf([{ ...canonical, kind: 'pi', piValue: 2 }], GOSTOP_RULES_STANDARD).gwang).toHaveLength(1)
    expect(() =>
      captureOf([{ ...canonical, id: 'fake' }], GOSTOP_RULES_STANDARD),
    ).toThrow(/없는 카드/)
  })
})

describe('scoreGostop', () => {
  it('광·열끗·띠·피 경계와 고도리·단 점수를 breakdown으로 설명한다', () => {
    const result = scoreGostop(
      capture([
        '02-yeol', '04-yeol', '08-yeol', '05-yeol', '06-yeol',
        '01-tti', '02-tti', '03-tti', '04-tti', '05-tti',
        '01-pi-1', '01-pi-2', '02-pi-1', '02-pi-2', '03-pi-1',
        '03-pi-2', '04-pi-1', '04-pi-2', '05-pi-1', '05-pi-2',
      ]),
      EMPTY_CONTEXT,
      GOSTOP_RULES_STANDARD,
    )
    expect(result.breakdown.map((line) => line.source)).toEqual(
      expect.arrayContaining(['열끗5', '띠5', '피10', '고도리', '홍단']),
    )
    expect(result.canStop).toBe(true)
  })

  it('비광 포함 3광과 4광·5광을 구분한다', () => {
    const score = (ids: string[]) =>
      scoreGostop(capture(ids), EMPTY_CONTEXT, GOSTOP_RULES_STANDARD).breakdown[0]
    expect(score(['01-gwang', '03-gwang', '12-gwang'])).toEqual({
      source: '광3(비광)',
      points: 2,
    })
    expect(score(['01-gwang', '03-gwang', '11-gwang', '12-gwang'])?.points).toBe(4)
    expect(score(['01-gwang', '03-gwang', '08-gwang', '11-gwang', '12-gwang'])?.points).toBe(15)
  })

  it('고·박·흔들기·폭탄 배수를 누적한다', () => {
    const winner = capture([
      '01-pi-1', '01-pi-2', '02-pi-1', '02-pi-2', '03-pi-1',
      '03-pi-2', '04-pi-1', '04-pi-2', '05-pi-1', '05-pi-2',
    ])
    const opponent = capture(['01-pi-1', '02-pi-1'])
    const result = scoreGostop(
      winner,
      { goCount: 3, shakeCount: 1, bombCount: 1, opponents: [opponent] },
      GOSTOP_RULES_STANDARD,
    )
    expect(result.multipliers.map((entry) => entry.source)).toEqual([
      '3고',
      '피박',
      '흔들기',
      '폭탄',
    ])
    expect(result.total).toBe((1 + 2) * 2 * 2 * 2 * 2)
  })

  it('capture의 위조 분류·piValue를 무시하고 카드 id에서 재집계한다', () => {
    const real = capture(['01-gwang'])
    const forged = { ...real, gwang: [], pi: real.gwang, piValue: 99 }
    const result = scoreGostop(forged, EMPTY_CONTEXT, GOSTOP_RULES_STANDARD)
    expect(result.base).toBe(0)
  })

  it('음수·비정수 횟수와 안전 범위를 넘는 점수를 거부한다', () => {
    const empty = capture([])
    expect(() =>
      scoreGostop(empty, { ...EMPTY_CONTEXT, goCount: -1 }, GOSTOP_RULES_STANDARD),
    ).toThrow(/goCount/)
    expect(() =>
      scoreGostop(empty, { ...EMPTY_CONTEXT, shakeCount: 1.5 }, GOSTOP_RULES_STANDARD),
    ).toThrow(/shakeCount/)
    expect(() =>
      scoreGostop(empty, { ...EMPTY_CONTEXT, goCount: 100 }, GOSTOP_RULES_STANDARD),
    ).toThrow(/안전한 정수 범위/)
  })
})
