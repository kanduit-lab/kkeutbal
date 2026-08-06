import { describe, expect, it } from 'vitest'
import type { AdminRoomView } from '../../admin-queries'
import { EMPTY_ROOM_QUERY, filterRooms, isRoomQueryActive, roomQueryKey } from './rooms-filter'

function room(over: Partial<AdminRoomView> & { id: string }): AdminRoomView {
  return {
    code: 'ABCDEF',
    name: '방',
    gameType: 'seotda',
    status: 'waiting',
    createdAt: '2026-08-01T00:00:00.000Z',
    memberCount: 2,
    hostName: '방장',
    ...over,
  }
}

const ROOMS: readonly AdminRoomView[] = [
  room({ id: '1', code: 'AAAAAA', name: 'E2E layout msb', hostName: '테스트관리자1' }),
  room({ id: '2', code: 'BBBBBB', name: '섯다 케스트', hostName: '윤영창', status: 'playing' }),
  room({ id: '3', code: 'CCCCCC', name: '[int] turn-and-raise', hostName: '테스트관리자1' }),
]

describe('filterRooms', () => {
  it('returns the same array when nothing is filtered', () => {
    expect(filterRooms(ROOMS, EMPTY_ROOM_QUERY)).toBe(ROOMS)
  })

  it('matches on room name, code, and host', () => {
    expect(filterRooms(ROOMS, { text: 'E2E', status: 'all' }).map((r) => r.id)).toEqual(['1'])
    expect(filterRooms(ROOMS, { text: 'bbbb', status: 'all' }).map((r) => r.id)).toEqual(['2'])
    expect(filterRooms(ROOMS, { text: '윤영창', status: 'all' }).map((r) => r.id)).toEqual(['2'])
  })

  it('matches bracket-prefixed test names so leftovers can be swept', () => {
    expect(filterRooms(ROOMS, { text: '[int]', status: 'all' }).map((r) => r.id)).toEqual(['3'])
  })

  it('combines text and status', () => {
    expect(filterRooms(ROOMS, { text: '', status: 'playing' }).map((r) => r.id)).toEqual(['2'])
    expect(filterRooms(ROOMS, { text: 'E2E', status: 'playing' })).toEqual([])
  })

  it('ignores case and surrounding spaces', () => {
    expect(filterRooms(ROOMS, { text: '  e2e  ', status: 'all' }).map((r) => r.id)).toEqual(['1'])
  })
})

describe('isRoomQueryActive', () => {
  it('is false only for an untouched query', () => {
    expect(isRoomQueryActive(EMPTY_ROOM_QUERY)).toBe(false)
    expect(isRoomQueryActive({ text: '   ', status: 'all' })).toBe(false)
    expect(isRoomQueryActive({ text: 'E2E', status: 'all' })).toBe(true)
    expect(isRoomQueryActive({ text: '', status: 'waiting' })).toBe(true)
  })
})

describe('roomQueryKey', () => {
  it('changes when the effective filter changes and not otherwise', () => {
    expect(roomQueryKey({ text: 'E2E', status: 'all' })).toBe(
      roomQueryKey({ text: ' e2e ', status: 'all' }),
    )
    expect(roomQueryKey({ text: 'E2E', status: 'all' })).not.toBe(
      roomQueryKey({ text: 'E2E', status: 'playing' }),
    )
  })
})
