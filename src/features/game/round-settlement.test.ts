import { describe, expect, it } from 'vitest'
import { winnerPayout } from './round-settlement'

describe('winnerPayout', () => {
  it('고스톱 점수 정산에 기존 베팅 팟을 합산한다', () => {
    expect(winnerPayout(120, 80)).toBe(200)
  })

  it('점수 정산이 없어도 기존 팟을 그대로 지급한다', () => {
    expect(winnerPayout(120)).toBe(120)
  })

  it('걷은 게 없으면 0을 돌려준다 — 이때 원장에 지급 행을 만들지 않는다', () => {
    expect(winnerPayout(0, 0)).toBe(0)
  })

  it('합이 안전 정수 범위를 넘으면 정밀도를 잃은 값을 내보내지 않고 던진다', () => {
    expect(() => winnerPayout(Number.MAX_SAFE_INTEGER, 1)).toThrow(/safe integer/)
  })
})