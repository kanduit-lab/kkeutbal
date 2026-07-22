import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

const { rooms, roomMembers, rounds, betActions, chipLedger, buyIns, users } = schema

/** net = balance - buyInTotal. 방 전체 net 합은 0 (칩 보존 불변식). */

export interface StandingRow {
  readonly userId: string
  readonly displayName: string
  readonly avatarUrl: string | null
  readonly balance: number
  readonly buyInTotal: number
  readonly net: number
  readonly wins: number
  readonly biggestPot: number
  readonly raises: number
  readonly folds: number
}

export async function getSessionStandings(roomId: string): Promise<StandingRow[]> {
  const members = await db
    .select({
      userId: roomMembers.userId,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(roomMembers)
    .innerJoin(users, eq(users.id, roomMembers.userId))
    .where(and(eq(roomMembers.roomId, roomId), isNull(roomMembers.leftAt)))

  const balances = await db
    .select({
      userId: chipLedger.userId,
      balance: sql<number>`coalesce(sum(${chipLedger.delta}), 0)::int`,
    })
    .from(chipLedger)
    .where(eq(chipLedger.roomId, roomId))
    .groupBy(chipLedger.userId)

  const buyInTotals = await db
    .select({
      userId: buyIns.userId,
      total: sql<number>`coalesce(sum(${buyIns.amount}), 0)::int`,
    })
    .from(buyIns)
    .where(eq(buyIns.roomId, roomId))
    .groupBy(buyIns.userId)

  const winRows = await db
    .select({
      winnerId: rounds.winnerId,
      wins: sql<number>`count(*)::int`,
      biggestPot: sql<number>`coalesce(max(${rounds.pot}), 0)::int`,
    })
    .from(rounds)
    .where(and(eq(rounds.roomId, roomId), eq(rounds.status, 'ended')))
    .groupBy(rounds.winnerId)

  const actionRows = await db
    .select({
      userId: betActions.userId,
      action: betActions.action,
      count: sql<number>`count(*)::int`,
    })
    .from(betActions)
    .where(and(eq(betActions.roomId, roomId), eq(betActions.status, 'accepted')))
    .groupBy(betActions.userId, betActions.action)

  const balanceMap = new Map(balances.map((row) => [row.userId, row.balance]))
  const buyInMap = new Map(buyInTotals.map((row) => [row.userId, row.total]))
  const winMap = new Map(
    winRows.filter((row) => row.winnerId).map((row) => [row.winnerId as string, row]),
  )
  const raiseMap = new Map<string, number>()
  const foldMap = new Map<string, number>()
  for (const row of actionRows) {
    if (row.action === 'raise') raiseMap.set(row.userId, row.count)
    if (row.action === 'fold') foldMap.set(row.userId, row.count)
  }

  return members
    .map((member) => {
      const balance = balanceMap.get(member.userId) ?? 0
      const buyInTotal = buyInMap.get(member.userId) ?? 0
      const win = winMap.get(member.userId)
      return {
        userId: member.userId,
        displayName: member.displayName,
        avatarUrl: member.avatarUrl,
        balance,
        buyInTotal,
        net: balance - buyInTotal,
        wins: win?.wins ?? 0,
        biggestPot: win?.biggestPot ?? 0,
        raises: raiseMap.get(member.userId) ?? 0,
        folds: foldMap.get(member.userId) ?? 0,
      }
    })
    .sort((a, b) => b.net - a.net)
}

export interface CumulativeRow {
  readonly userId: string
  readonly displayName: string
  readonly avatarUrl: string | null
  readonly net: number
  readonly wins: number
  readonly sessions: number
}

/** 누적 랭킹 — 정산 완료(settled)된 방만 집계한다. 진행 중인 방은 순위를 흔들지 않는다. */
export async function getCumulativeRanking(): Promise<CumulativeRow[]> {
  const settledRooms = db
    .select({ id: rooms.id })
    .from(rooms)
    .where(inArray(rooms.status, ['settled', 'closed']))

  const chipRows = await db
    .select({
      userId: chipLedger.userId,
      balance: sql<number>`coalesce(sum(${chipLedger.delta}), 0)::int`,
    })
    .from(chipLedger)
    .where(inArray(chipLedger.roomId, settledRooms))
    .groupBy(chipLedger.userId)

  const buyInRows = await db
    .select({
      userId: buyIns.userId,
      total: sql<number>`coalesce(sum(${buyIns.amount}), 0)::int`,
    })
    .from(buyIns)
    .where(inArray(buyIns.roomId, settledRooms))
    .groupBy(buyIns.userId)

  const winRows = await db
    .select({
      winnerId: rounds.winnerId,
      wins: sql<number>`count(*)::int`,
    })
    .from(rounds)
    .where(and(inArray(rounds.roomId, settledRooms), eq(rounds.status, 'ended')))
    .groupBy(rounds.winnerId)

  const sessionRows = await db
    .select({
      userId: roomMembers.userId,
      sessions: sql<number>`count(*)::int`,
    })
    .from(roomMembers)
    .where(inArray(roomMembers.roomId, settledRooms))
    .groupBy(roomMembers.userId)

  const userIds = sessionRows.map((row) => row.userId)
  if (userIds.length === 0) return []

  const userRows = await db
    .select({ id: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl })
    .from(users)
    .where(inArray(users.id, userIds))

  const balanceMap = new Map(chipRows.map((row) => [row.userId, row.balance]))
  const buyInMap = new Map(buyInRows.map((row) => [row.userId, row.total]))
  const winMap = new Map(
    winRows.filter((row) => row.winnerId).map((row) => [row.winnerId as string, row.wins]),
  )
  const userMap = new Map(userRows.map((row) => [row.id, row]))

  return sessionRows
    .map((row) => {
      const user = userMap.get(row.userId)
      const balance = balanceMap.get(row.userId) ?? 0
      const buyInTotal = buyInMap.get(row.userId) ?? 0
      return {
        userId: row.userId,
        displayName: user?.displayName ?? '알 수 없음',
        avatarUrl: user?.avatarUrl ?? null,
        net: balance - buyInTotal,
        wins: winMap.get(row.userId) ?? 0,
        sessions: row.sessions,
      }
    })
    .sort((a, b) => b.net - a.net)
}

export interface RoundHistoryRow {
  readonly seq: number
  readonly winnerId: string | null
  readonly winnerName: string | null
  readonly pot: number
  readonly note: string | null
  readonly status: 'ended' | 'voided'
  readonly endedAt: string | null
}

export async function getRoundHistory(roomId: string): Promise<RoundHistoryRow[]> {
  const roundRows = await db
    .select({
      seq: rounds.seq,
      winnerId: rounds.winnerId,
      pot: rounds.pot,
      result: rounds.result,
      status: rounds.status,
      endedAt: rounds.endedAt,
      winnerName: users.displayName,
    })
    .from(rounds)
    .leftJoin(users, eq(users.id, rounds.winnerId))
    .where(and(eq(rounds.roomId, roomId), inArray(rounds.status, ['ended', 'voided'])))
    .orderBy(desc(rounds.seq))

  return roundRows.map((row) => ({
    seq: row.seq,
    winnerId: row.winnerId,
    winnerName: row.winnerName,
    pot: row.pot,
    note: readNote(row.result),
    status: row.status as 'ended' | 'voided',
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
  }))
}

function readNote(result: unknown): string | null {
  if (result && typeof result === 'object' && 'note' in result) {
    const note = (result as { note?: unknown }).note
    return typeof note === 'string' ? note : null
  }
  return null
}
