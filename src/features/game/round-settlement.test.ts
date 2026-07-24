import { describe, expect, it } from 'vitest'
import { winnerPayout } from './round-settlement'

describe('winnerPayout', () => {
  it('고스톱 점수 정산에 기존 베팅 팟을 합산한다', () => {
    expect(winnerPayout(120, 80)).toBe(200)
  })

  it('점수 정산이 없어도 기존 팟을 그대로 지급한다', () => {
    expect(winnerPayout(120)).toBe(120)
  })
})
