import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type {
  BetActionView,
  LastResultView,
  MemberView,
  RoomSnapshot,
  RoomView,
} from './types'

const { rooms, roomMembers, users, rounds, betActions, chipLedger, buyIns } = schema

export async function findRoomByCode(code: string): Promise<RoomView | null> {
  const [room] = await db.select().from(rooms).where(eq(rooms.code, code)).limit(1)
  if (!room) return null
  return toRoomView(room)
}

function toRoomView(room: typeof rooms.$inferSelect): RoomView {
  return {
    id: room.id,
    code: room.code,
    name: room.name,
    gameType: room.gameType,
    status: room.status,
    inputMode: room.inputMode,
    startingChips: room.startingChips,
    hostId: room.hostId,
  }
}

export async function getMemberRole(
  roomId: string,
  userId: string,
): Promise<MemberView['role'] | null> {
  const [member] = await db
    .select({ role: roomMembers.role })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)))
    .limit(1)
  return member?.role ?? null
}

async function getMembers(roomId: string): Promise<MemberView[]> {
  const memberRows = await db
    .select({
      userId: roomMembers.userId,
      role: roomMembers.role,
      seatNo: roomMembers.seatNo,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(roomMembers)
    .innerJoin(users, eq(users.id, roomMembers.userId))
    .where(and(eq(roomMembers.roomId, roomId), isNull(roomMembers.leftAt)))
    .orderBy(asc(roomMembers.seatNo))

  const balanceRows = await db
    .select({
      userId: chipLedger.userId,
      balance: sql<number>`coalesce(sum(${chipLedger.delta}), 0)::int`,
    })
    .from(chipLedger)
    .where(eq(chipLedger.roomId, roomId))
    .groupBy(chipLedger.userId)

  const buyInRows = await db
    .select({
      userId: buyIns.userId,
      total: sql<number>`coalesce(sum(${buyIns.amount}), 0)::int`,
    })
    .from(buyIns)
    .where(eq(buyIns.roomId, roomId))
    .groupBy(buyIns.userId)

  const balanceMap = new Map(balanceRows.map((row) => [row.userId, row.balance]))
  const buyInMap = new Map(buyInRows.map((row) => [row.userId, row.total]))

  return memberRows.map((member) => ({
    userId: member.userId,
    displayName: member.displayName,
    avatarUrl: member.avatarUrl,
    role: member.role,
    seatNo: member.seatNo,
    balance: balanceMap.get(member.userId) ?? 0,
    buyInTotal: buyInMap.get(member.userId) ?? 0,
  }))
}

/** 현재 판의 팟 = 그 판에서 나간 베팅(정정 반영) 합계의 부호 반전. */
export async function getRoundPot(roundId: string): Promise<number> {
  const [row] = await db
    .select({
      pot: sql<number>`coalesce(-sum(${chipLedger.delta}), 0)::int`,
    })
    .from(chipLedger)
    .where(
      and(
        eq(chipLedger.roundId, roundId),
        inArray(chipLedger.reason, ['bet', 'correction']),
      ),
    )
  return row?.pot ?? 0
}

function toActionView(action: typeof betActions.$inferSelect): BetActionView {
  return {
    id: action.id,
    roundId: action.roundId,
    userId: action.userId,
    enteredBy: action.enteredBy,
    action: action.action,
    amount: action.amount,
    status: action.status,
    reason: action.reason,
    seq: action.seq,
    createdAt: action.createdAt.toISOString(),
  }
}

export async function getRoomSnapshot(roomId: string): Promise<RoomSnapshot | null> {
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1)
  if (!room) return null

  const members = await getMembers(roomId)

  const [currentRoundRow] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.roomId, roomId), eq(rounds.status, 'playing')))
    .orderBy(desc(rounds.seq))
    .limit(1)

  const currentRound = currentRoundRow
    ? { id: currentRoundRow.id, seq: currentRoundRow.seq, pot: await getRoundPot(currentRoundRow.id) }
    : null

  const actionRows = currentRoundRow
    ? await db
        .select()
        .from(betActions)
        .where(eq(betActions.roundId, currentRoundRow.id))
        .orderBy(asc(betActions.seq))
    : []

  const [lastEnded] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.roomId, roomId), eq(rounds.status, 'ended')))
    .orderBy(desc(rounds.seq))
    .limit(1)

  const lastResult: LastResultView | null = lastEnded
    ? {
        seq: lastEnded.seq,
        winnerId: lastEnded.winnerId,
        pot: lastEnded.pot,
        note: readResultNote(lastEnded.result),
      }
    : null

  const [endedCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(rounds)
    .where(and(eq(rounds.roomId, roomId), eq(rounds.status, 'ended')))

  return {
    room: toRoomView(room),
    members,
    currentRound,
    actions: actionRows.map(toActionView),
    lastResult,
    endedRounds: endedCount?.count ?? 0,
  }
}

function readResultNote(result: unknown): string | null {
  if (result && typeof result === 'object' && 'note' in result) {
    const note = (result as { note?: unknown }).note
    return typeof note === 'string' ? note : null
  }
  return null
}

/** 로그인 사용자가 참가 중인(정산 전) 방 목록 — 홈 화면용. */
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
