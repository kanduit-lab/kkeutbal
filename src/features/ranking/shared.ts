import { sql } from 'drizzle-orm'
import { schema } from '@/lib/db'

const { roomMembers, roundParticipants, rounds, buyIns } = schema

/**
 * True when a room member actually played a session — non-observer role,
 * or an observer who bought in or was recorded in a round's participant
 * snapshot. Shared by cumulative ranking and per-player stats so "sessions"
 * counts the same way everywhere.
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
