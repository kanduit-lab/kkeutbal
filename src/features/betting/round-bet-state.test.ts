import { describe, expect, it } from 'vitest'
import {
  canCoverCall,
  contributedBy,
  minimumRaiseAmount,
  neededToCall,
  roundBetState,
} from './round-bet-state'

const accepted = (userId: string, action: 'call' | 'raise' | 'allin', amount: number) => ({
  userId,
  action,
  amount,
  status: 'accepted' as const,
})

describe('roundBetState', () => {
  it('각 플레이어의 누적 납입액으로 다음 콜 금액을 계산한다', () => {
    const state = roundBetState([
      accepted('a', 'raise', 100),
      accepted('b', 'call', 100),
      accepted('a', 'raise', 101),
    ])

    expect(contributedBy(state, 'a')).toBe(201)
    expect(neededToCall(state, 'b')).toBe(101)
    expect(minimumRaiseAmount(state, 'b', 10)).toBe(102)
  })

  it('짧은 올인은 기존 콜 기준을 낮추지 않는다', () => {
    const state = roundBetState([accepted('a', 'raise', 100), accepted('b', 'allin', 50)])

    expect(state.currentToCall).toBe(100)
    expect(neededToCall(state, 'b')).toBe(50)
  })

  it('거절·되돌린 액션은 누적 납입액에서 제외한다', () => {
    const state = roundBetState([
      accepted('a', 'raise', 100),
      { userId: 'b', action: 'call', amount: 100, status: 'reverted' as const },
      { userId: 'c', action: 'raise', amount: 200, status: 'rejected' as const },
    ])

    expect(contributedBy(state, 'b')).toBe(0)
    expect(state.currentToCall).toBe(100)
  })
})

describe('canCoverCall', () => {
  it('남은 칩이 콜 금액 이상이면 true', () => {
    const state = roundBetState([accepted('a', 'raise', 100)])

    expect(canCoverCall(state, 'b', 100)).toBe(true)
    expect(canCoverCall(state, 'b', 1000)).toBe(true)
  })

  it('남은 칩이 콜 금액에 못 미치면 false', () => {
    const state = roundBetState([accepted('a', 'raise', 5000)])

    expect(canCoverCall(state, 'b', 500)).toBe(false)
  })

  it('이미 낸 금액을 빼고 판단한다 — 남은 콜 금액만 채우면 된다', () => {
    const state = roundBetState([accepted('a', 'raise', 5000), accepted('b', 'call', 4800)])

    expect(canCoverCall(state, 'b', 200)).toBe(true)
    expect(canCoverCall(state, 'b', 199)).toBe(false)
  })

  it('맞출 베팅이 없으면 잔액 0도 true — 체크·다이는 막지 않는다', () => {
    const state = roundBetState([])

    expect(canCoverCall(state, 'a', 0)).toBe(true)
  })
})