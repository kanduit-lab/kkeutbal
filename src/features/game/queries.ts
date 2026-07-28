import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import {
  defaultBaseBet,
  readBaseBet,
  readJoinAsObserver,
  readMaxMembers,
  readPointValue,
} from './action-helpers'
import { subtractSafeChipIntegers, toSafeChipInteger } from './chip-integers'
import { readFundingMode } from './funding-mode'
import { readFairPlaySettings } from './fair-play-settings'
import type {
  BetActionView,
  LastResultView,
  MemberView,
  RoomSnapshot,
  RoomView,
  RoundPenaltyView,
} from './types'

const {
  rooms,
  roomMembers,
  users,
  rounds,
  roundParticipants,
  betActions,
  chipLedger,
  buyIns,
  roundFairness,
  roundFairnessParticipants,
} = schema

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
    fundingMode: readFundingMode(room.rulePreset),
    fairPlay: readFairPlaySettings(room.gameType, room.rulePreset),
  }
}

export async function getMemberRole(
  roomId: string,
  userId: string,
): Promise<MemberView['role'] | null> {
  const [member] = await db
    .select({ role: roomMembers.role })
    .from(roomMembers)
    .where(
      and(
        eq(roomMembers.roomId, roomId),
        eq(roomMembers.userId, userId),
        isNull(roomMembers.leftAt),
      ),
    )
    .limit(1)
  return member?.role ?? null
}

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