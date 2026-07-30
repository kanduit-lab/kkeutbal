import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { subtractSafeChipIntegers, toSafeChipInteger } from './chip-integers'
import type { RoomView } from './types'

const { rooms, roomMembers, roundParticipants, buyIns, chipLedger, rounds } = schema

function hasPlayedSession(): ReturnType<typeof sql> {
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

export async function getMyActiveRooms(userId: string): Promise<
  Array<{
    code: string
    name: string
    gameType: RoomView['gameType']
    status: string
    memberCount: number
  }>
> {
  const roomRows = await db
    .select({
      code: rooms.code,
      name: rooms.name,
      gameType: rooms.gameType,
      status: rooms.status,
      roomId: rooms.id,
    })
    .from(roomMembers)
    .innerJoin(rooms, eq(rooms.id, roomMembers.roomId))
    .where(
      and(
        eq(roomMembers.userId, userId),
        isNull(roomMembers.leftAt),
        inArray(rooms.status, ['waiting', 'playing']),
      ),
    )
    .orderBy(desc(rooms.createdAt))
    .limit(10)

  const counts = roomRows.length
    ? await db
        .select({
          roomId: roomMembers.roomId,
          count: sql<number>`count(*)::int`,
        })
        .from(roomMembers)
        .where(
          and(
            inArray(
              roomMembers.roomId,
              roomRows.map((row) => row.roomId),
            ),
            isNull(roomMembers.leftAt),
          ),
        )
        .groupBy(roomMembers.roomId)
    : []

  const countMap = new Map(counts.map((row) => [row.roomId, row.count]))

  return roomRows.map((row) => ({
    code: row.code,
    name: row.name,
    gameType: row.gameType,
    status: row.status,
    memberCount: countMap.get(row.roomId) ?? 0,
  }))
}

export async function getMyRecentSessions(
  userId: string,
  limit = 10,
): Promise<
  Array<{
    id: string
    code: string
    name: string
    gameType: RoomView['gameType']
    closedAt: string | null
    myNet: number
  }>
> {
  const roomRows = await db
    .select({
      id: rooms.id,
      code: rooms.code,
      name: rooms.name,
      gameType: rooms.gameType,
      closedAt: rooms.closedAt,
    })
    .from(roomMembers)
    .innerJoin(rooms, eq(rooms.id, roomMembers.roomId))
    .where(
      and(
        eq(roomMembers.userId, userId),
        inArray(rooms.status, ['settled', 'closed']),
        hasPlayedSession(),
      ),
    )
    .orderBy(desc(sql`coalesce(${rooms.closedAt}, ${rooms.createdAt})`))
    .limit(limit)

  if (roomRows.length === 0) return []

  const roomIds = roomRows.map((row) => row.id)

  const [balanceRows, buyInRows] = await Promise.all([
    db
      .select({
        roomId: chipLedger.roomId,
        balance: sql<string>`coalesce(sum(${chipLedger.delta}), 0)::text`,
      })
      .from(chipLedger)
      .where(and(eq(chipLedger.userId, userId), inArray(chipLedger.roomId, roomIds)))
      .groupBy(chipLedger.roomId),
    db
      .select({
        roomId: buyIns.roomId,
        total: sql<string>`coalesce(sum(${buyIns.amount}), 0)::text`,
      })
      .from(buyIns)
      .where(and(eq(buyIns.userId, userId), inArray(buyIns.roomId, roomIds)))
      .groupBy(buyIns.roomId),
  ])

  const balanceMap = new Map(
    balanceRows.map((row) => [
      row.roomId,
      toSafeChipInteger(row.balance, 'Recent session balance'),
    ]),
  )
  const buyInMap = new Map(
    buyInRows.map((row) => [
      row.roomId,
      toSafeChipInteger(row.total, 'Recent session buy-in total'),
    ]),
  )

  return roomRows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    gameType: row.gameType,
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    myNet: subtractSafeChipIntegers(
      balanceMap.get(row.id) ?? 0,
      buyInMap.get(row.id) ?? 0,
      'Recent session net',
    ),
  }))
}
