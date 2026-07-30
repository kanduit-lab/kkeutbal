import { sql } from 'drizzle-orm'
import { schema } from '@/lib/db'

const { roomMembers, roundParticipants, rounds, buyIns } = schema

/**
 * "이 방 멤버가 실제로 세션을 뛰었는가" 판정. `room_members` 행이 있다는 것만으로는 부족하다 —
 * 관전자로 들어와 아무것도 하지 않은 사람은 세션을 뛴 것이 아니다. 그래서 관전자가 아니거나,
 * 관전자라도 바이인을 했거나 판 참가자 스냅샷(`round_participants`)에 남았을 때만 참이다.
 *
 * **이 규칙은 game이 소유한다.** 판정 대상이 전부 game의 테이블(`room_members`·`buy_ins`·
 * `round_participants`·`rounds`)이고, 의존 방향도 ranking → game 한쪽이다(ranking이 game의
 * 결과를 집계하는 구조이고 그 반대는 없다).
 *
 * 홈 화면의 "지난 세션"(`my-rooms-queries.ts`)과 랭킹 집계·개인 통계(`features/ranking/`)가 같은
 * 함수를 쓴다. 전에는 같은 SQL 조각이 두 곳에 복사돼 있었고, 한쪽만 바뀌면 같은 사람에 대해
 * 두 화면이 다른 답을 내는 구조였다. `roomMembers`를 참조하므로 호출하는 쿼리가
 * `room_members`를 FROM/JOIN에 갖고 있어야 한다.
 */
export function hasPlayedSession(): ReturnType<typeof sql> {
  return sql`(
    ${roomMembers.role} <> 'observer'
    or exists (
      select 1 from ${buyIns} played_buy_in
      where played_buy_in.room_id = ${roomMembers.roomId}
        and played_buy_in.user_id = ${roomMembers.userId}
    )
    or exists (
      select 1
      from ${roundParticipants} played_participant
      inner join ${rounds} played_round on played_round.id = played_participant.round_id
      where played_round.room_id = ${roomMembers.roomId}
        and played_participant.user_id = ${roomMembers.userId}
    )
  )`
}
