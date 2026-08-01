import { describe, expect, it } from 'vitest'
import { betPulse, latestAcceptedId } from './bet-pulse'
import type { BetActionView } from './types'

const BASE = {
  roundId: '00000000-0000-4000-8000-000000000001',
  enteredBy: null,
  reason: null,
  createdAt: new Date(0).toISOString(),
} as const

function action(patch: Partial<BetActionView> & Pick<BetActionView, 'id' | 'userId' | 'seq'>) {
  return {
    ...BASE,
    action: 'call',
    amount: 0,
    status: 'accepted',
    ...patch,
  } as BetActionView
}

describe('latestAcceptedId', () => {
  it('accepted 중 seq 가 가장 큰 액션의 id 를 고른다', () => {
    expect(
      latestAcceptedId([
        action({ id: 'a', userId: 'u1', seq: 3 }),
        action({ id: 'b', userId: 'u2', seq: 7 }),
        action({ id: 'c', userId: 'u3', seq: 5 }),
      ]),
    ).toBe('b')
  })

  it('accepted 가 없으면 null 이다', () => {
    expect(
      latestAcceptedId([action({ id: 'a', userId: 'u1', seq: 1, status: 'pending' })]),
    ).toBeNull()
  })
})

describe('betPulse', () => {
  const actions = [
    action({ id: 'a', userId: 'u1', seq: 1, action: 'call', amount: 100 }),
    action({ id: 'b', userId: 'u2', seq: 2, action: 'raise', amount: 300 }),
  ]

  it('마지막으로 본 액션이 그대로면 아무것도 울리지 않는다', () => {
    expect(betPulse(actions, { lastSeenActionId: 'b', selfId: 'u9' })).toBeNull()
  })

  it('새 액션이 들어오면 행위자·종류·금액을 실어 한 번만 울린다', () => {
    expect(betPulse(actions, { lastSeenActionId: 'a', selfId: 'u9' })).toEqual({
      actionId: 'b',
      userId: 'u2',
      action: 'raise',
      amount: 300,
      isSelf: false,
    })
  })

  it('내가 한 액션이면 isSelf 로 구분한다 — 내 화면 연출을 다르게 주기 위해서다', () => {
    expect(betPulse(actions, { lastSeenActionId: 'a', selfId: 'u2' })?.isSelf).toBe(true)
  })

  it('아직 아무것도 본 적 없으면(첫 진입) 울리지 않는다', () => {
    // 방에 들어오자마자 직전 판의 마지막 액션 소리가 울리면 안 된다.
    expect(betPulse(actions, { lastSeenActionId: undefined, selfId: 'u9' })).toBeNull()
  })

  it('accepted 액션이 하나도 없으면 울리지 않는다', () => {
    expect(betPulse([], { lastSeenActionId: undefined, selfId: 'u9' })).toBeNull()
    expect(betPulse([], { lastSeenActionId: 'a', selfId: 'u9' })).toBeNull()
  })

  it('pending 이 accepted 로 바뀌면 그때 울린다', () => {
    const pendingFirst = [action({ id: 'a', userId: 'u1', seq: 1, status: 'pending', amount: 50 })]
    expect(betPulse(pendingFirst, { lastSeenActionId: null, selfId: 'u9' })).toBeNull()

    const approved = [action({ id: 'a', userId: 'u1', seq: 1, status: 'accepted', amount: 50 })]
    expect(betPulse(approved, { lastSeenActionId: null, selfId: 'u9' })?.actionId).toBe('a')
  })
})
