import { and, eq, gte, inArray, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { subtractSafeChipIntegers, toSafeChipInteger } from '@/features/game/chip-integers'
import { hasPlayedSession } from '@/features/game/played-session'

const { rooms, roomMembers, rounds, chipLedger, buyIns, users } = schema

export interface CumulativeRow {
  readonly userId: string
  readonly displayName: string
  readonly avatarUrl: string | null
  readonly net: number
  readonly wins: number
  readonly sessions: number
}

export interface CumulativeRankingFilter {
  readonly gameType?: 'seotda' | 'gostop' | 'poker'

  readonly since?: Date
}

export async function getCumulativeRanking(
  filter: CumulativeRankingFilter = {},
): Promise<CumulativeRow[]> {
  const roomConditions = [inArray(rooms.status, ['settled', 'closed'])]
  if (filter.gameType) roomConditions.push(eq(rooms.gameType, filter.gameType))
  if (filter.since) roomConditions.push(gte(rooms.closedAt, filter.since))

  const settledRooms = db
    .select({ id: rooms.id })
    .from(rooms)
    .where(and(...roomConditions))

  const chipRows = await db
    .select({
      userId: chipLedger.userId,
      balance: sql<string>`coalesce(sum(${chipLedger.delta}), 0)::text`,
    })
    .from(chipLedger)
    .where(inArray(chipLedger.roomId, settledRooms))
    .groupBy(chipLedger.userId)

  const buyInRows = await db
    .select({
      userId: buyIns.userId,
      total: sql<string>`coalesce(sum(${buyIns.amount}), 0)::text`,
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
    .where(and(inArray(roomMembers.roomId, settledRooms), hasPlayedSession()))
    .groupBy(roomMembers.userId)

  const userIds = sessionRows.map((row) => row.userId)
  if (userIds.length === 0) return []

  const userRows = await db
    .select({ id: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl })
    .from(users)
    .where(and(inArray(users.id, userIds), eq(users.isManaged, false)))

  const balanceMap = new Map(
    chipRows.map((row) => [row.userId, toSafeChipInteger(row.balance, 'Cumulative balance')]),
  )
  const buyInMap = new Map(
    buyInRows.map((row) => [row.userId, toSafeChipInteger(row.total, 'Cumulative buy-in')]),
  )
  const winMap = new Map(
    winRows.filter((row) => row.winnerId).map((row) => [row.winnerId as string, row.wins]),
  )
  const userMap = new Map(userRows.map((row) => [row.id, row]))

  return sessionRows
    .filter((row) => userMap.has(row.userId))
    .map((row) => {
      const user = userMap.get(row.userId)
      const balance = balanceMap.get(row.userId) ?? 0
      const buyInTotal = buyInMap.get(row.userId) ?? 0
      return {
        userId: row.userId,
        displayName: user?.displayName ?? '알 수 없음',
        avatarUrl: user?.avatarUrl ?? null,
        net: subtractSafeChipIntegers(balance, buyInTotal, 'Cumulative net'),
        wins: winMap.get(row.userId) ?? 0,
        sessions: row.sessions,
      }
    })
    .sort((a, b) => b.net - a.net)
}
