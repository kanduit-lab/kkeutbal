import type { AdminRoomView } from '../../admin-queries'

export type RoomStatusFilter = 'all' | 'waiting' | 'playing'

export interface RoomQuery {
  readonly text: string
  readonly status: RoomStatusFilter
}

export const EMPTY_ROOM_QUERY: RoomQuery = { text: '', status: 'all' }

/**
 * 코드·방 이름·방장 이름 중 하나라도 걸리면 통과. 일괄 정산의 실제 쓰임이 "테스트 잔여물만
 * 골라 닫기"라서, 이름 조각(`E2E`, `[int]`, `repro`)으로 좁힐 수 있는 게 핵심이다.
 */
function matchesText(room: AdminRoomView, needle: string): boolean {
  if (needle === '') return true
  return [room.code, room.name, room.hostName].some((value) => value.toLowerCase().includes(needle))
}

/** 검색어·상태를 한 번에 적용한다. 입력 배열은 그대로 두고 새 배열을 만든다. */
export function filterRooms(
  rooms: readonly AdminRoomView[],
  query: RoomQuery,
): readonly AdminRoomView[] {
  const needle = query.text.trim().toLowerCase()
  if (needle === '' && query.status === 'all') return rooms
  return rooms.filter(
    (room) => matchesText(room, needle) && (query.status === 'all' || room.status === query.status),
  )
}

/** 조건이 하나라도 걸려 있는지 — 빈 목록 안내와 초기화 버튼 노출에 쓴다. */
export function isRoomQueryActive(query: RoomQuery): boolean {
  return query.text.trim() !== '' || query.status !== 'all'
}

/** 조건이 바뀌면 페이지를 1로 되돌리기 위한 키. */
export function roomQueryKey(query: RoomQuery): string {
  return `${query.text.trim().toLowerCase()}|${query.status}`
}
