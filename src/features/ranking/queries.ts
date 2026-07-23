import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { getMyRecentSessions } from '@/features/game/queries'

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

export interface CumulativeRankingFilter {
  readonly gameType?: 'seotda' | 'gostop' | 'poker'
  /** 이 시각 이후 종료(closedAt)된 방만 집계. closedAt 이 없는 방은 기간 필터에서 제외된다. */
  readonly since?: Date
}

/** 누적 랭킹 — 정산 완료(settled)된 방만 집계한다. 진행 중인 방은 순위를 흔들지 않는다. */
export async function getCumulativeRanking(
  filter: CumulativeRankingFilter = {},
): Promise<CumulativeRow[]> {
  // 필터는 방 단위로만 건다 — 조건을 만족한 방의 기록 전체가 집계 대상이 된다.
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

/* ── 개인 전적 ───────────────────────────────────────────── */

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
  /**
   * 참가 판 수의 근사치 — 판 단위 참가자를 저장하지 않으므로(rounds 에 참가자 컬럼 없음),
   * 멤버였던 방에서 끝난(ended) 판 전체를 센다.
   */
  readonly rounds: number
  readonly wins: number
  readonly net: number
}

export interface PlayerStats {
  /** 세션이 있는 게임만, 섯다 → 고스톱 → 포커 순. */
  readonly perGame: readonly PlayerGameStats[]
  readonly totals: {
    readonly sessions: number
    readonly rounds: number
    readonly wins: number
    readonly net: number
  }
}

const GAME_ORDER: ReadonlyArray<PlayerGameStats['gameType']> = ['seotda', 'gostop', 'poker']

/**
 * 개인 누적 전적 — 정산 완료(settled/closed)된 방만, 게임별로 집계한다.
 * 멤버 행은 soft leave(leftAt)라 지워지지 않고, 중도 퇴장자는 상쇄 행으로 net 0 이 되므로
 * 누적 랭킹(getCumulativeRanking)과 같은 기준으로 잡힌다.
 */
export async function getPlayerStats(userId: string): Promise<PlayerStats> {
  // 이 사용자가 멤버였던 정산 완료 방 — 판수·승수 집계의 범위.
  const memberRoomIds = db
    .select({ id: roomMembers.roomId })
    .from(roomMembers)
    .innerJoin(rooms, eq(rooms.id, roomMembers.roomId))
    .where(and(eq(roomMembers.userId, userId), inArray(rooms.status, ['settled', 'closed'])))

  // 순수 읽기 5개 — 서로 독립이므로 병렬.
  const [sessionRows, roundRows, winRows, balanceRows, buyInRows] = await Promise.all([
    db
      .select({ gameType: rooms.gameType, sessions: sql<number>`count(*)::int` })
      .from(roomMembers)
      .innerJoin(rooms, eq(rooms.id, roomMembers.roomId))
      .where(and(eq(roomMembers.userId, userId), inArray(rooms.status, ['settled', 'closed'])))
      .groupBy(rooms.gameType),
    db
      .select({ gameType: rooms.gameType, rounds: sql<number>`count(*)::int` })
      .from(rounds)
      .innerJoin(rooms, eq(rooms.id, rounds.roomId))
      .where(and(eq(rounds.status, 'ended'), inArray(rounds.roomId, memberRoomIds)))
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
        balance: sql<number>`coalesce(sum(${chipLedger.delta}), 0)::int`,
      })
      .from(chipLedger)
      .innerJoin(rooms, eq(rooms.id, chipLedger.roomId))
      .where(and(eq(chipLedger.userId, userId), inArray(rooms.status, ['settled', 'closed'])))
      .groupBy(rooms.gameType),
    db
      .select({
        gameType: rooms.gameType,
        total: sql<number>`coalesce(sum(${buyIns.amount}), 0)::int`,
      })
      .from(buyIns)
      .innerJoin(rooms, eq(rooms.id, buyIns.roomId))
      .where(and(eq(buyIns.userId, userId), inArray(rooms.status, ['settled', 'closed'])))
      .groupBy(rooms.gameType),
  ])

  const sessionMap = new Map(sessionRows.map((row) => [row.gameType, row.sessions]))
  const roundMap = new Map(roundRows.map((row) => [row.gameType, row.rounds]))
  const winMap = new Map(winRows.map((row) => [row.gameType, row.wins]))
  const balanceMap = new Map(balanceRows.map((row) => [row.gameType, row.balance]))
  const buyInMap = new Map(buyInRows.map((row) => [row.gameType, row.total]))

  const perGame = GAME_ORDER.map((gameType) => ({
    gameType,
    sessions: sessionMap.get(gameType) ?? 0,
    rounds: roundMap.get(gameType) ?? 0,
    wins: winMap.get(gameType) ?? 0,
    net: (balanceMap.get(gameType) ?? 0) - (buyInMap.get(gameType) ?? 0),
  })).filter((row) => row.sessions > 0)

  const totals = perGame.reduce(
    (acc, row) => ({
      sessions: acc.sessions + row.sessions,
      rounds: acc.rounds + row.rounds,
      wins: acc.wins + row.wins,
      net: acc.net + row.net,
    }),
    { sessions: 0, rounds: 0, wins: 0, net: 0 },
  )

  return { perGame, totals }
}

export type PlayerRecentSession = Awaited<ReturnType<typeof getMyRecentSessions>>[number]

/** 최근 정산 세션 — 홈 화면 getMyRecentSessions 와 같은 데이터를 임의 사용자로 조회한다. */
export async function getPlayerRecentSessions(
  userId: string,
  limit = 10,
): Promise<PlayerRecentSession[]> {
  return getMyRecentSessions(userId, limit)
}
