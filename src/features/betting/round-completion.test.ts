import { describe, expect, it } from 'vitest'
import { computeRoundCompletion } from './round-completion'

const accepted = (userId: string, action: 'call' | 'raise' | 'allin' | 'fold', amount: number) => ({
  userId,
  action,
  amount,
  status: 'accepted' as const,
})

describe('computeRoundCompletion', () => {
  it('아무도 액션하지 않았으면 active', () => {
    expect(computeRoundCompletion(['a', 'b'], [])).toEqual({ kind: 'active' })
  })

  it('한쪽만 베팅하고 상대가 아직 안 맞췄으면 active', () => {
    const actions = [accepted('a', 'raise', 100)]
    expect(computeRoundCompletion(['a', 'b'], actions)).toEqual({ kind: 'active' })
  })

  it('전원 콜을 맞추면 showdown_ready — 콜을 맞춘 참가자 목록을 돌려준다', () => {
    const actions = [accepted('a', 'raise', 100), accepted('b', 'call', 100)]
    expect(computeRoundCompletion(['a', 'b'], actions)).toEqual({
      kind: 'showdown_ready',
      contenderIds: ['a', 'b'],
    })
  })

  it('전원 체크(베팅 0)도 액션을 다 했으면 showdown_ready', () => {
    const actions = [accepted('a', 'call', 0), accepted('b', 'call', 0)]
    expect(computeRoundCompletion(['a', 'b'], actions)).toEqual({
      kind: 'showdown_ready',
      contenderIds: ['a', 'b'],
    })
  })

  it('3인 중 2명이 fold하면 남은 1명이 single_survivor', () => {
    const actions = [
      accepted('a', 'raise', 100),
      accepted('b', 'fold', 0),
      accepted('c', 'fold', 0),
    ]
    expect(computeRoundCompletion(['a', 'b', 'c'], actions)).toEqual({
      kind: 'single_survivor',
      winnerId: 'a',
    })
  })

  it('fold하지 않은 사람이 있어도 콜을 아직 안 맞췄으면 active', () => {
    const actions = [
      accepted('a', 'raise', 100),
      accepted('b', 'fold', 0),
      // c는 아직 액션하지 않았다
    ]
    expect(computeRoundCompletion(['a', 'b', 'c'], actions)).toEqual({ kind: 'active' })
  })

  it('레이즈 후 일부만 콜하고 나머지는 아직이면 active', () => {
    const actions = [
      accepted('a', 'raise', 100),
      accepted('b', 'call', 100),
      // c는 아직 액션하지 않았다
    ]
    expect(computeRoundCompletion(['a', 'b', 'c'], actions)).toEqual({ kind: 'active' })
  })

  it('짧은 올인(잔액 500 vs 레이즈 5000)이 있어도 판은 종료 단계에 도달한다 — 교착 금지', () => {
    // 재현: A 10000칩이 5000 레이즈, B 500칩이 올인. B의 기여(500) !== currentToCall(5000)이라
    // 예전에는 영원히 active였고, B는 올인이라 turn-order에서도 빠져 아무도 행동할 수 없었다.
    // 올인한 사람은 더 낼 칩이 없으므로 "콜을 못 맞췄다"는 이유로 판을 잡아둘 수 없다.
    const actions = [accepted('a', 'raise', 5000), accepted('b', 'allin', 500)]
    expect(computeRoundCompletion(['a', 'b'], actions)).toEqual({
      kind: 'showdown_ready',
      contenderIds: ['a', 'b'],
    })
  })

  it('올인 위로 다른 두 사람이 더 올려 서로 맞추면 종료 단계에 도달한다', () => {
    // 콜 금액을 채운 정상 올인(b=500)이라도, 뒤이어 c가 5000으로 올리면 b의 기여는 자동으로
    // 뒤처진다. b는 더 낼 수 없으므로 a·c만 서로 맞추면 완료다.
    const actions = [
      accepted('a', 'raise', 500),
      accepted('b', 'allin', 500),
      accepted('c', 'raise', 5000),
      accepted('a', 'call', 4500),
    ]
    expect(computeRoundCompletion(['a', 'b', 'c'], actions)).toEqual({
      kind: 'showdown_ready',
      contenderIds: ['a', 'b', 'c'],
    })
  })

  it('올인이 있어도 아직 콜을 안 맞춘 참가자가 남았으면 active', () => {
    const actions = [
      accepted('a', 'raise', 500),
      accepted('b', 'allin', 500),
      accepted('c', 'raise', 5000),
      // a는 c의 5000에 아직 응답하지 않았다
    ]
    expect(computeRoundCompletion(['a', 'b', 'c'], actions)).toEqual({ kind: 'active' })
  })

  it('콘텐더 전원이 올인이면 그 자체로 종료 단계', () => {
    const actions = [accepted('a', 'allin', 5000), accepted('b', 'allin', 500)]
    expect(computeRoundCompletion(['a', 'b'], actions)).toEqual({
      kind: 'showdown_ready',
      contenderIds: ['a', 'b'],
    })
  })

  it('participantIds가 1명뿐이면(나머지 전원 퇴장 등) single_survivor', () => {
    expect(computeRoundCompletion(['a'], [])).toEqual({ kind: 'single_survivor', winnerId: 'a' })
  })

  it('참가자가 없으면 active', () => {
    expect(computeRoundCompletion([], [])).toEqual({ kind: 'active' })
  })

  it('reverted·pending 액션은 무시한다', () => {
    const actions = [
      accepted('a', 'raise', 100),
      { userId: 'b', action: 'call' as const, amount: 100, status: 'pending' as const },
    ]
    expect(computeRoundCompletion(['a', 'b'], actions)).toEqual({ kind: 'active' })
  })
})
