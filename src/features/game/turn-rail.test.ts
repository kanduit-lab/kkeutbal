import { describe, expect, it } from 'vitest'
import { turnRail } from './turn-rail'
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

const SEATS = ['u1', 'u2', 'u3'] as const

describe('turnRail', () => {
  it('판이 없으면 이전·현재·다음이 모두 비어 있다', () => {
    const rail = turnRail(SEATS, [action({ id: 'a', userId: 'u1', seq: 1 })], {
      roundActive: false,
    })

    expect(rail).toEqual({ previous: null, pending: null, currentId: null, nextId: null })
  })

  it('아직 아무도 안 했으면 선이 현재, 그 다음 좌석이 다음이다', () => {
    const rail = turnRail(SEATS, [], { roundActive: true })

    expect(rail.previous).toBeNull()
    expect(rail.currentId).toBe('u1')
    expect(rail.nextId).toBe('u2')
  })

  it('이전 칸은 seq 가 가장 큰 accepted 액션 하나다', () => {
    const rail = turnRail(
      SEATS,
      [
        action({ id: 'a', userId: 'u1', seq: 1, action: 'call', amount: 100 }),
        action({ id: 'b', userId: 'u2', seq: 2, action: 'raise', amount: 300 }),
      ],
      { roundActive: true },
    )

    expect(rail.previous).toMatchObject({ id: 'b', userId: 'u2', action: 'raise', amount: 300 })
    expect(rail.currentId).toBe('u3')
    expect(rail.nextId).toBe('u1')
  })

  it('rejected·reverted 액션은 이전 칸에 오르지 않는다', () => {
    const rail = turnRail(
      SEATS,
      [
        action({ id: 'a', userId: 'u1', seq: 1, action: 'call', amount: 100 }),
        action({ id: 'b', userId: 'u2', seq: 2, action: 'raise', status: 'rejected' }),
        action({ id: 'c', userId: 'u3', seq: 3, action: 'fold', status: 'reverted' }),
      ],
      { roundActive: true },
    )

    expect(rail.previous?.id).toBe('a')
  })

  it('다이·올인한 참가자는 현재·다음 후보에서 빠진다', () => {
    const rail = turnRail(
      SEATS,
      [
        action({ id: 'a', userId: 'u1', seq: 1, action: 'raise', amount: 100 }),
        action({ id: 'b', userId: 'u2', seq: 2, action: 'fold' }),
        action({ id: 'c', userId: 'u3', seq: 3, action: 'call', amount: 100 }),
      ],
      { roundActive: true },
    )

    // u3 다음은 좌석 순환으로 u1 — 다이한 u2 는 건너뛴다
    expect(rail.currentId).toBe('u1')
    expect(rail.nextId).toBe('u3')
  })

  it('행동 가능한 참가자가 한 명뿐이면 다음 칸은 비어 있다', () => {
    const rail = turnRail(
      SEATS,
      [
        action({ id: 'a', userId: 'u2', seq: 1, action: 'fold' }),
        action({ id: 'b', userId: 'u3', seq: 2, action: 'fold' }),
      ],
      { roundActive: true },
    )

    expect(rail.currentId).toBe('u1')
    expect(rail.nextId).toBeNull()
  })

  it('전원이 더 못 움직이면 현재·다음이 모두 비고 이전만 남는다', () => {
    const rail = turnRail(
      SEATS,
      [
        action({ id: 'a', userId: 'u1', seq: 1, action: 'allin', amount: 500 }),
        action({ id: 'b', userId: 'u2', seq: 2, action: 'fold' }),
        action({ id: 'c', userId: 'u3', seq: 3, action: 'fold' }),
      ],
      { roundActive: true },
    )

    expect(rail.currentId).toBeNull()
    expect(rail.nextId).toBeNull()
    expect(rail.previous?.id).toBe('c')
  })

  it('승인 대기 액션은 seq 가 가장 큰 것 하나를 따로 싣는다', () => {
    const rail = turnRail(
      SEATS,
      [
        action({ id: 'a', userId: 'u1', seq: 1, action: 'call', amount: 100 }),
        action({ id: 'b', userId: 'u2', seq: 2, action: 'raise', amount: 300, status: 'pending' }),
        action({ id: 'c', userId: 'u3', seq: 3, action: 'call', amount: 300, status: 'pending' }),
      ],
      { roundActive: true },
    )

    expect(rail.pending).toMatchObject({ id: 'c', userId: 'u3' })
    expect(rail.previous?.id).toBe('a')
  })

  it('참가자가 없으면 빈 노선을 돌려준다', () => {
    expect(turnRail([], [], { roundActive: true })).toEqual({
      previous: null,
      pending: null,
      currentId: null,
      nextId: null,
    })
  })

  it('참가자가 한 명이면 현재만 채우고 다음은 비운다', () => {
    const rail = turnRail(['u1'], [], { roundActive: true })

    expect(rail.currentId).toBe('u1')
    expect(rail.nextId).toBeNull()
  })
})
