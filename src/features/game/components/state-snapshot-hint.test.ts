import { describe, expect, it } from 'vitest'
import { applyStateSnapshotHint, type StateSnapshotPayload } from './state-snapshot-hint'
import type { RoomSnapshot } from '../types'

function makeSnapshot(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    room: {
      id: 'room-1',
      code: 'ABCD',
      name: '테스트 방',
      gameType: 'seotda',
      status: 'playing',
      inputMode: 'trust',
      startingChips: 10_000,
      hostId: 'user-1',
      pointValue: 100,
      baseBet: 100,
      maxMembers: 10,
      joinAsObserver: false,
      fundingMode: 'session',
      fairPlay: {
        dealing: 'manual',
        seedCollectionSeconds: 20,
        turnTimeoutSeconds: 30,
        timeoutPolicy: 'pause',
      },
    },
    members: [
      {
        userId: 'user-1',
        displayName: '진성',
        avatarUrl: null,
        role: 'host',
        seatNo: 0,
        balance: 5_000,
        buyInTotal: 10_000,
        joinedAt: '2026-07-30T00:00:00.000Z',
        isManaged: false,
      },
      {
        userId: 'user-2',
        displayName: '민수',
        avatarUrl: null,
        role: 'player',
        seatNo: 1,
        balance: 3_000,
        buyInTotal: 10_000,
        joinedAt: '2026-07-30T00:00:00.000Z',
        isManaged: false,
      },
    ],
    currentRound: {
      id: 'round-1',
      seq: 1,
      pot: 500,
      startedAt: '2026-07-30T00:00:00.000Z',
      fairness: null,
    },
    actions: [],
    lastResult: null,
    endedRounds: 0,
    recentRounds: [],
    ...overrides,
  }
}

function makePayload(overrides: Partial<StateSnapshotPayload> = {}): StateSnapshotPayload {
  return {
    roomStatus: 'playing',
    currentRound: { roundId: 'round-1', seq: 1, pot: 500 },
    balances: [
      { userId: 'user-1', balance: 5_000 },
      { userId: 'user-2', balance: 3_000 },
    ],
    ...overrides,
  }
}

describe('applyStateSnapshotHint', () => {
  it('같은 라운드의 팟 변화를 즉시 반영한다', () => {
    const current = makeSnapshot()
    const next = applyStateSnapshotHint(
      current,
      makePayload({ currentRound: { roundId: 'round-1', seq: 1, pot: 800 } }),
    )
    expect(next.currentRound?.pot).toBe(800)
    // 라운드의 다른 필드(시작 시각·fairness 등)는 보존된다
    expect(next.currentRound?.startedAt).toBe(current.currentRound?.startedAt)
    expect(next.currentRound?.fairness).toBe(current.currentRound?.fairness)
  })

  it('다른 라운드(roundId 불일치)의 팟은 반영하지 않는다 — round.* 즉시 refetch에 맡긴다', () => {
    const current = makeSnapshot()
    const next = applyStateSnapshotHint(
      current,
      makePayload({ currentRound: { roundId: 'round-2', seq: 2, pot: 999 } }),
    )
    expect(next.currentRound).toBe(current.currentRound)
  })

  it('현재 라운드가 없을 때는 팟을 만들어내지 않는다', () => {
    const current = makeSnapshot({ currentRound: null })
    const next = applyStateSnapshotHint(
      current,
      makePayload({ currentRound: { roundId: 'round-1', seq: 1, pot: 800 } }),
    )
    expect(next.currentRound).toBeNull()
  })

  it('멤버 잔액을 반영한다', () => {
    const current = makeSnapshot()
    const next = applyStateSnapshotHint(
      current,
      makePayload({ balances: [{ userId: 'user-2', balance: 2_500 }] }),
    )
    expect(next.members.find((m) => m.userId === 'user-2')?.balance).toBe(2_500)
    // payload에 없는(또는 안 바뀐) 멤버는 참조를 유지한다
    expect(next.members.find((m) => m.userId === 'user-1')).toBe(current.members[0])
  })

  it('아무것도 안 바뀌면 같은 참조를 돌려준다 (불필요한 리렌더 방지)', () => {
    const current = makeSnapshot()
    const next = applyStateSnapshotHint(current, makePayload())
    expect(next).toBe(current)
  })

  it('room.status는 절대 반영하지 않는다 — payload는 신뢰하지 않는 힌트다', () => {
    const current = makeSnapshot()
    const next = applyStateSnapshotHint(current, makePayload({ roomStatus: 'settled' }))
    expect(next.room.status).toBe('playing')
    expect(next.room).toBe(current.room)
  })
})
