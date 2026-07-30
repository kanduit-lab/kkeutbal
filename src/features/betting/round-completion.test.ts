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

  it('짧은 올인은 콜 완료로 치지 않는다(올인 금액이 currentToCall보다 적으면 active 아님 — 올인은 액션 자체로 완료 후보)', () => {
    const actions = [accepted('a', 'raise', 100), accepted('b', 'allin', 50)]
    // b는 fold하지 않았고(올인), a도 fold하지 않았다 — 두 콘텐더 모두 액션을 했지만
    // b의 기여(50) !== currentToCall(100)이므로 아직 완료가 아니다(a가 콜해야 함이 아니라,
    // b가 짧은 올인이라 a 기준으로는 이미 낸 게 커서 판정이 갈릴 수 있음을 확인)
    expect(computeRoundCompletion(['a', 'b'], actions)).toEqual({ kind: 'active' })
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
