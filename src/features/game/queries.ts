import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import {
  defaultBaseBet,
  readBaseBet,
  readJoinAsObserver,
  readMaxMembers,
  readPointValue,
} from './action-helpers'
import type {
  BetActionView,
  LastResultView,
  MemberView,
  RoomSnapshot,
  RoomView,
  RoundPenaltyView,
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
    pointValue: readPointValue(room.rulePreset),
    baseBet: readBaseBet(room.rulePreset) ?? defaultBaseBet(room.startingChips),
    maxMembers: readMaxMembers(room.rulePreset),
    joinAsObserver: readJoinAsObserver(room.rulePreset),
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
  // 순수 읽기 3개 — 서로 독립이므로 병렬. 트랜잭션 불필요 (진실은 스냅샷 refetch 가 보장).
  const [memberRows, balanceRows, buyInRows] = await Promise.all([
    db
      .select({
        userId: roomMembers.userId,
        role: roomMembers.role,
        seatNo: roomMembers.seatNo,
        joinedAt: roomMembers.joinedAt,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(roomMembers)
      .innerJoin(users, eq(users.id, roomMembers.userId))
      .where(and(eq(roomMembers.roomId, roomId), isNull(roomMembers.leftAt)))
      .orderBy(asc(roomMembers.seatNo)),
    db
      .select({
        userId: chipLedger.userId,
        balance: sql<number>`coalesce(sum(${chipLedger.delta}), 0)::int`,
      })
      .from(chipLedger)
      .where(eq(chipLedger.roomId, roomId))
      .groupBy(chipLedger.userId),
    db
      .select({
        userId: buyIns.userId,
        total: sql<number>`coalesce(sum(${buyIns.amount}), 0)::int`,
      })
      .from(buyIns)
      .where(eq(buyIns.roomId, roomId))
      .groupBy(buyIns.userId),
  ])

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
    joinedAt: member.joinedAt.toISOString(),
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
  // 순수 읽기 스냅샷 — 독립 쿼리를 병렬로 돌린다. 트랜잭션 불필요 (진실은 refetch 가 보장).
  const [roomRows, members, currentRoundRows, lastEndedRows, endedCountRows, recentRoundRows] =
    await Promise.all([
      db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1),
      getMembers(roomId),
      db
        .select()
        .from(rounds)
        .where(and(eq(rounds.roomId, roomId), eq(rounds.status, 'playing')))
        .orderBy(desc(rounds.seq))
        .limit(1),
      db
        .select()
        .from(rounds)
        .where(and(eq(rounds.roomId, roomId), eq(rounds.status, 'ended')))
        .orderBy(desc(rounds.seq))
        .limit(1),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(rounds)
        .where(and(eq(rounds.roomId, roomId), eq(rounds.status, 'ended'))),
      db
        .select({
          seq: rounds.seq,
          winnerId: rounds.winnerId,
          pot: rounds.pot,
          result: rounds.result,
          status: rounds.status,
        })
        .from(rounds)
        .where(and(eq(rounds.roomId, roomId), inArray(rounds.status, ['ended', 'voided'])))
        .orderBy(desc(rounds.seq))
        .limit(5),
    ])

  const [room] = roomRows
  if (!room) return null

  const [currentRoundRow] = currentRoundRows

  // 2단계 — 현재 판이 있을 때만 필요한 쿼리. 팟·액션은 서로 독립이므로 병렬.
  const [pot, actionRows]: [number, Array<typeof betActions.$inferSelect>] = currentRoundRow
    ? await Promise.all([
        getRoundPot(currentRoundRow.id),
        db
          .select()
          .from(betActions)
          .where(eq(betActions.roundId, currentRoundRow.id))
          .orderBy(asc(betActions.seq)),
      ])
    : [0, []]

  const currentRound = currentRoundRow
    ? {
        id: currentRoundRow.id,
        seq: currentRoundRow.seq,
        pot,
        startedAt: currentRoundRow.startedAt.toISOString(),
      }
    : null

  const [lastEnded] = lastEndedRows

  const lastResult: LastResultView | null = lastEnded
    ? {
        seq: lastEnded.seq,
        winnerId: lastEnded.winnerId,
        pot: lastEnded.pot,
        note: readResultNote(lastEnded.result),
      }
    : null

  const [endedCount] = endedCountRows

  return {
    room: toRoomView(room),
    members,
    currentRound,
    actions: actionRows.map(toActionView),
    lastResult,
    endedRounds: endedCount?.count ?? 0,
    recentRounds: recentRoundRows.map((row) => ({
      seq: row.seq,
      winnerId: row.winnerId,
      pot: row.pot,
      note: readResultNote(row.result),
      status: row.status as 'ended' | 'voided',
      penalties: readResultPenalties(row.result),
    })),
  }
}

function readResultNote(result: unknown): string | null {
  if (result && typeof result === 'object' && 'note' in result) {
    const note = (result as { note?: unknown }).note
    return typeof note === 'string' ? note : null
  }
  return null
}

/**
 * rounds.result jsonb 의 penalties 필드를 방어적으로 읽는다.
 * 구버전 판(필드 없음)·형식이 다른 값은 조용히 빈 배열로 처리한다 — 크래시 금지.
 */
function readResultPenalties(result: unknown): RoundPenaltyView[] {
  if (!result || typeof result !== 'object' || !('penalties' in result)) return []
  const raw = (result as { penalties?: unknown }).penalties
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const userId = (entry as { userId?: unknown }).userId
    const factor = (entry as { factor?: unknown }).factor
    if (typeof userId !== 'string' || (factor !== 2 && factor !== 4)) return []
    return [{ userId, factor }]
  })
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

/**
 * 정산 완료된 방의 내 손익 이력 — 홈/프로필 화면용.
 * myNet = 칩 잔액(원장 합) - 바이인 합. 랭킹 standings 와 같은 계산식.
 */
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
      and(eq(roomMembers.userId, userId), inArray(rooms.status, ['settled', 'closed'])),
    )
    .orderBy(desc(sql`coalesce(${rooms.closedAt}, ${rooms.createdAt})`))
    .limit(limit)

  if (roomRows.length === 0) return []

  const roomIds = roomRows.map((row) => row.id)

  const [balanceRows, buyInRows] = await Promise.all([
    db
      .select({
        roomId: chipLedger.roomId,
        balance: sql<number>`coalesce(sum(${chipLedger.delta}), 0)::int`,
      })
      .from(chipLedger)
      .where(and(eq(chipLedger.userId, userId), inArray(chipLedger.roomId, roomIds)))
      .groupBy(chipLedger.roomId),
    db
      .select({
        roomId: buyIns.roomId,
        total: sql<number>`coalesce(sum(${buyIns.amount}), 0)::int`,
      })
      .from(buyIns)
      .where(and(eq(buyIns.userId, userId), inArray(buyIns.roomId, roomIds)))
      .groupBy(buyIns.roomId),
  ])

  const balanceMap = new Map(balanceRows.map((row) => [row.roomId, row.balance]))
  const buyInMap = new Map(buyInRows.map((row) => [row.roomId, row.total]))

  return roomRows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    gameType: row.gameType,
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    myNet: (balanceMap.get(row.id) ?? 0) - (buyInMap.get(row.id) ?? 0),
  }))
}
