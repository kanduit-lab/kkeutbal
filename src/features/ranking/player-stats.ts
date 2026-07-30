import { and, eq, inArray, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { getMyRecentSessions } from '@/features/game/queries'
import {
  addSafeChipIntegers,
  subtractSafeChipIntegers,
  toSafeChipInteger,
} from '@/features/game/chip-integers'
import { hasPlayedSession } from './shared'

const { rooms, roomMembers, rounds, roundParticipants, chipLedger, buyIns, users } = schema

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
