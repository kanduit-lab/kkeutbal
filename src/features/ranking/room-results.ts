import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type { RoundPenaltyView } from '@/features/game/types'
import { subtractSafeChipIntegers, toSafeChipInteger } from '@/features/game/chip-integers'

const { rounds, betActions, chipLedger, buyIns, users, roomMembers } = schema

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
