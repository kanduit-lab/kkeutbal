import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { getMyRecentSessions } from '@/features/game/queries'
import type { RoundPenaltyView } from '@/features/game/types'
import {
  addSafeChipIntegers,
  subtractSafeChipIntegers,
  toSafeChipInteger,
} from '@/features/game/chip-integers'

const { rooms, roomMembers, rounds, roundParticipants, betActions, chipLedger, buyIns, users } =
  schema

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
      role: roomMembers.role,
    })
    .from(roomMembers)
    .innerJoin(users, eq(users.id, roomMembers.userId))
    .where(eq(roomMembers.roomId, roomId))

  const balances = await db
    .select({
      userId: chipLedger.userId,
      balance: sql<string>`coalesce(sum(${chipLedger.delta}), 0)::text`,
    })
    .from(chipLedger)
    .where(eq(chipLedger.roomId, roomId))
    .groupBy(chipLedger.userId)

  const buyInTotals = await db
    .select({
      userId: buyIns.userId,
      total: sql<string>`coalesce(sum(${buyIns.amount}), 0)::text`,
    })
    .from(buyIns)
    .where(eq(buyIns.roomId, roomId))
    .groupBy(buyIns.userId)

  const winRows = await db
    .select({
      winnerId: rounds.winnerId,
      wins: sql<number>`count(*)::int`,
      biggestPot: sql<string>`coalesce(max(${rounds.pot}), 0)::text`,
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

  const balanceMap = new Map(
    balances.map((row) => [row.userId, toSafeChipInteger(row.balance, 'Session standing balance')]),
  )
  const buyInMap = new Map(
    buyInTotals.map((row) => [row.userId, toSafeChipInteger(row.total, 'Session standing buy-in')]),
  )
  const winMap = new Map(
    winRows
      .filter((row) => row.winnerId)
      .map((row) => [
        row.winnerId as string,
        { ...row, biggestPot: toSafeChipInteger(row.biggestPot, 'Session biggest pot') },
      ]),
  )
  const raiseMap = new Map<string, number>()
  const foldMap = new Map<string, number>()
  for (const row of actionRows) {
    if (row.action === 'raise') raiseMap.set(row.userId, row.count)
    if (row.action === 'fold') foldMap.set(row.userId, row.count)
  }

  return members
    .filter(
      (member) =>
        member.role !== 'observer' ||
        balanceMap.has(member.userId) ||
        buyInMap.has(member.userId) ||
        winMap.has(member.userId) ||
        raiseMap.has(member.userId) ||
        foldMap.has(member.userId),
    )
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
        net: subtractSafeChipIntegers(balance, buyInTotal, 'Session standing net'),
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

export interface RoundHistoryRow {
  readonly seq: number
  readonly winnerId: string | null
  readonly winnerName: string | null
  readonly pot: number
  readonly note: string | null
  readonly status: 'ended' | 'voided'
  readonly endedAt: string | null

  readonly penalties: readonly RoundPenaltyView[]
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
    penalties: readPenalties(row.result),
  }))
}

function readNote(result: unknown): string | null {
  if (result && typeof result === 'object' && 'note' in result) {
    const note = (result as { note?: unknown }).note
    return typeof note === 'string' ? note : null
  }
  return null
}

function readPenalties(result: unknown): RoundPenaltyView[] {
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

export interface PlayerProfile {
  readonly displayName: string
  readonly avatarUrl: string | null
}

export async function getPlayerProfile(userId: string): Promise<PlayerProfile | null> {
  const [user] = await db
    .select({ displayName: users.displayName, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return user ?? null
}

export interface PlayerGameStats {
  readonly gameType: 'seotda' | 'gostop' | 'poker'
  readonly sessions: number

  readonly rounds: number
  readonly wins: number
  readonly net: number
}

export interface PlayerStats {
  readonly perGame: readonly PlayerGameStats[]
  readonly totals: {
    readonly sessions: number
    readonly rounds: number
    readonly wins: number
    readonly net: number
  }
}

const GAME_ORDER: ReadonlyArray<PlayerGameStats['gameType']> = ['seotda', 'gostop', 'poker']

export async function getPlayerStats(userId: string): Promise<PlayerStats> {
  const memberRoomIds = db
    .select({ id: roomMembers.roomId })
    .from(roomMembers)
    .innerJoin(rooms, eq(rooms.id, roomMembers.roomId))
    .where(
      and(
        eq(roomMembers.userId, userId),
        inArray(rooms.status, ['settled', 'closed']),
        hasPlayedSession(),
      ),
    )

  const [sessionRows, roundRows, winRows, balanceRows, buyInRows] = await Promise.all([
    db
      .select({ gameType: rooms.gameType, sessions: sql<number>`count(*)::int` })
      .from(roomMembers)
      .innerJoin(rooms, eq(rooms.id, roomMembers.roomId))
      .where(
        and(
          eq(roomMembers.userId, userId),
          inArray(rooms.status, ['settled', 'closed']),
          hasPlayedSession(),
        ),
      )
      .groupBy(rooms.gameType),
    db
      .select({ gameType: rooms.gameType, rounds: sql<number>`count(*)::int` })
      .from(roundParticipants)
      .innerJoin(rounds, eq(rounds.id, roundParticipants.roundId))
      .innerJoin(rooms, eq(rooms.id, rounds.roomId))
      .where(
        and(
          eq(roundParticipants.userId, userId),
          eq(rounds.status, 'ended'),
          inArray(rounds.roomId, memberRoomIds),
        ),
      )
      .groupBy(rooms.gameType),
    db
      .select({ gameType: rooms.gameType, wins: sql<number>`count(*)::int` })
      .from(rounds)
      .innerJoin(rooms, eq(rooms.id, rounds.roomId))
      .where(
        and(
          eq(rounds.status, 'ended'),
          eq(rounds.winnerId, userId),
          inArray(rounds.roomId, memberRoomIds),
        ),
      )
      .groupBy(rooms.gameType),
    db
      .select({
        gameType: rooms.gameType,
        balance: sql<string>`coalesce(sum(${chipLedger.delta}), 0)::text`,
      })
      .from(chipLedger)
      .innerJoin(rooms, eq(rooms.id, chipLedger.roomId))
      .where(and(eq(chipLedger.userId, userId), inArray(rooms.status, ['settled', 'closed'])))
      .groupBy(rooms.gameType),
    db
      .select({
        gameType: rooms.gameType,
        total: sql<string>`coalesce(sum(${buyIns.amount}), 0)::text`,
      })
      .from(buyIns)
      .innerJoin(rooms, eq(rooms.id, buyIns.roomId))
      .where(and(eq(buyIns.userId, userId), inArray(rooms.status, ['settled', 'closed'])))
      .groupBy(rooms.gameType),
  ])

  const sessionMap = new Map(sessionRows.map((row) => [row.gameType, row.sessions]))
  const roundMap = new Map(roundRows.map((row) => [row.gameType, row.rounds]))
  const winMap = new Map(winRows.map((row) => [row.gameType, row.wins]))
  const balanceMap = new Map(
    balanceRows.map((row) => [row.gameType, toSafeChipInteger(row.balance, 'Player game balance')]),
  )
  const buyInMap = new Map(
    buyInRows.map((row) => [row.gameType, toSafeChipInteger(row.total, 'Player game buy-in')]),
  )

  const perGame = GAME_ORDER.map((gameType) => ({
    gameType,
    sessions: sessionMap.get(gameType) ?? 0,
    rounds: roundMap.get(gameType) ?? 0,
    wins: winMap.get(gameType) ?? 0,
    net: subtractSafeChipIntegers(
      balanceMap.get(gameType) ?? 0,
      buyInMap.get(gameType) ?? 0,
      'Player game net',
    ),
  })).filter((row) => row.sessions > 0)

  const totals = perGame.reduce(
    (acc, row) => ({
      sessions: acc.sessions + row.sessions,
      rounds: acc.rounds + row.rounds,
      wins: acc.wins + row.wins,
      net: addSafeChipIntegers(acc.net, row.net, 'Player total net'),
    }),
    { sessions: 0, rounds: 0, wins: 0, net: 0 },
  )

  return { perGame, totals }
}

export type PlayerRecentSession = Awaited<ReturnType<typeof getMyRecentSessions>>[number]

export async function getPlayerRecentSessions(
  userId: string,
  limit = 10,
): Promise<PlayerRecentSession[]> {
  return getMyRecentSessions(userId, limit)
}