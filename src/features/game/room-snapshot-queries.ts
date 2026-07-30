import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { toSafeChipInteger } from './chip-integers'
import { toRoomView } from './room-lookup-queries'
import type {
  BetActionView,
  LastResultView,
  MemberView,
  RoomSnapshot,
  RoundPenaltyView,
} from './types'

const {
  rooms,
  roomMembers,
  users,
  rounds,
  betActions,
  chipLedger,
  buyIns,
  roundFairness,
  roundFairnessParticipants,
} = schema

async function getMembers(roomId: string): Promise<MemberView[]> {
  const [memberRows, balanceRows, buyInRows] = await Promise.all([
    db
      .select({
        userId: roomMembers.userId,
        role: roomMembers.role,
        seatNo: roomMembers.seatNo,
        joinedAt: roomMembers.joinedAt,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        isManaged: users.isManaged,
      })
      .from(roomMembers)
      .innerJoin(users, eq(users.id, roomMembers.userId))
      .where(and(eq(roomMembers.roomId, roomId), isNull(roomMembers.leftAt)))
      .orderBy(asc(roomMembers.seatNo)),
    db
      .select({
        userId: chipLedger.userId,
        balance: sql<string>`coalesce(sum(${chipLedger.delta}), 0)::text`,
      })
      .from(chipLedger)
      .where(eq(chipLedger.roomId, roomId))
      .groupBy(chipLedger.userId),
    db
      .select({
        userId: buyIns.userId,
        total: sql<string>`coalesce(sum(${buyIns.amount}), 0)::text`,
      })
      .from(buyIns)
      .where(eq(buyIns.roomId, roomId))
      .groupBy(buyIns.userId),
  ])

  const balanceMap = new Map(
    balanceRows.map((row) => [row.userId, toSafeChipInteger(row.balance, 'Member chip balance')]),
  )
  const buyInMap = new Map(
    buyInRows.map((row) => [row.userId, toSafeChipInteger(row.total, 'Member buy-in total')]),
  )

  return memberRows.map((member) => ({
    userId: member.userId,
    displayName: member.displayName,
    avatarUrl: member.avatarUrl,
    role: member.role,
    seatNo: member.seatNo,
    balance: balanceMap.get(member.userId) ?? 0,
    buyInTotal: buyInMap.get(member.userId) ?? 0,
    isManaged: member.isManaged,
    joinedAt: member.joinedAt.toISOString(),
  }))
}

export async function getRoundPot(roundId: string): Promise<number> {
  const [row] = await db
    .select({
      pot: sql<string>`coalesce(-sum(${chipLedger.delta}), 0)::text`,
    })
    .from(chipLedger)
    .where(and(eq(chipLedger.roundId, roundId), inArray(chipLedger.reason, ['bet', 'correction'])))
  return toSafeChipInteger(row?.pot ?? '0', 'Round pot')
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
        .select({
          id: rounds.id,
          seq: rounds.seq,
          winnerId: rounds.winnerId,
          pot: rounds.pot,
          result: rounds.result,
          hasFairnessAudit: sql<boolean>`exists (
            select 1 from ${roundFairness} fairness_audit
            where fairness_audit.round_id = ${rounds.id}
              and fairness_audit.phase = 'revealed'
          )`,
        })
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
          id: rounds.id,
          seq: rounds.seq,
          winnerId: rounds.winnerId,
          pot: rounds.pot,
          result: rounds.result,
          status: rounds.status,
          hasFairnessAudit: sql<boolean>`exists (
            select 1 from ${roundFairness} fairness_audit
            where fairness_audit.round_id = ${rounds.id}
              and fairness_audit.phase = 'revealed'
          )`,
        })
        .from(rounds)
        .where(and(eq(rounds.roomId, roomId), inArray(rounds.status, ['ended', 'voided'])))
        .orderBy(desc(rounds.seq))
        .limit(5),
    ])

  const [room] = roomRows
  if (!room) return null

  const [currentRoundRow] = currentRoundRows

  const [pot, actionRows, fairnessRows, fairnessParticipantRows]: [
    number,
    Array<typeof betActions.$inferSelect>,
    Array<{
      phase: 'collecting_seeds' | 'sealed' | 'revealed' | 'aborted'
      serverSeedCommitment: string
      seedDeadline: Date
      publicReceipt: unknown
    }>,
    Array<{
      participantCount: number
      submittedParticipantCount: number
      participantUserIds: string[]
      submittedParticipantUserIds: string[]
    }>,
  ] = currentRoundRow
    ? await Promise.all([
        getRoundPot(currentRoundRow.id),
        db
          .select()
          .from(betActions)
          .where(eq(betActions.roundId, currentRoundRow.id))
          .orderBy(asc(betActions.seq)),
        db
          .select({
            phase: roundFairness.phase,
            serverSeedCommitment: roundFairness.serverSeedCommitment,
            seedDeadline: roundFairness.seedDeadline,
            publicReceipt: roundFairness.publicReceipt,
          })
          .from(roundFairness)
          .where(eq(roundFairness.roundId, currentRoundRow.id))
          .limit(1),
        db
          .select({
            participantCount: sql<number>`count(*)::int`,
            submittedParticipantCount: sql<number>`count(${roundFairnessParticipants.clientSeedHash})::int`,
            participantUserIds: sql<
              string[]
            >`coalesce(array_agg(${roundFairnessParticipants.userId} order by ${roundFairnessParticipants.dealOrder}), '{}')`,
            submittedParticipantUserIds: sql<
              string[]
            >`coalesce(array_agg(${roundFairnessParticipants.userId} order by ${roundFairnessParticipants.dealOrder}) filter (where ${roundFairnessParticipants.clientSeedHash} is not null), '{}')`,
          })
          .from(roundFairnessParticipants)
          .where(eq(roundFairnessParticipants.roundId, currentRoundRow.id)),
      ])
    : [0, [], [], []]

  const [fairness] = fairnessRows
  const [fairnessParticipants] = fairnessParticipantRows

  const currentRound = currentRoundRow
    ? {
        id: currentRoundRow.id,
        seq: currentRoundRow.seq,
        pot,
        startedAt: currentRoundRow.startedAt.toISOString(),
        fairness: fairness
          ? {
              phase: fairness.phase,
              serverSeedCommitment: fairness.serverSeedCommitment,
              seedDeadline: fairness.seedDeadline.toISOString(),
              submittedParticipantCount: fairnessParticipants?.submittedParticipantCount ?? 0,
              participantCount: fairnessParticipants?.participantCount ?? 0,
              participantUserIds: fairnessParticipants?.participantUserIds ?? [],
              submittedParticipantUserIds: fairnessParticipants?.submittedParticipantUserIds ?? [],
              publicReceipt: fairness.publicReceipt,
            }
          : null,
      }
    : null

  const [lastEnded] = lastEndedRows

  const lastResult: LastResultView | null = lastEnded
    ? {
        roundId: lastEnded.id,
        seq: lastEnded.seq,
        winnerId: lastEnded.winnerId,
        pot: lastEnded.pot,
        note: readResultNote(lastEnded.result),
        hasFairnessAudit: lastEnded.hasFairnessAudit,
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
      roundId: row.id,
      seq: row.seq,
      winnerId: row.winnerId,
      pot: row.pot,
      note: readResultNote(row.result),
      status: row.status as 'ended' | 'voided',
      penalties: readResultPenalties(row.result),
      hasFairnessAudit: row.hasFairnessAudit,
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
