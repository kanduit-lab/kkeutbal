'use server'

import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { db, schema } from '@/lib/db'
import { currentUserId } from '../auth/session'
import {
  FAIRNESS_ALGORITHM_VERSION,
  commitServerSeed,
  generateFairnessSeed,
} from '../fairness/protocol'
import { FAIRNESS_PUBLIC_RECEIPT_VERSION } from '../fairness/receipt'
import { encryptFairnessServerSeed } from '../fairness/seed-crypto'
import {
  fairDatabaseNow,
  loadFairRoundParticipants,
  revealPersistedFairRound,
  resolvePersistedFairSeotdaShowdown,
  type PersistedFairRound,
} from '../fairness/fair-round-service'
import { getRoundPot } from './queries'
import { balanceInRoom, lockRoom, readPointValue, requireRole } from './action-helpers'
import { readFairPlaySettings } from './fair-play-settings'
import { winnerPayout } from './round-settlement'
import { creditPotToWinner, finalizeRoundRecord, revealFairnessIfNeeded } from './round-finalize'
import { SEOTDA_RULES_STANDARD } from '../seotda/types'
import type { RoundPenaltyView } from './types'

export { autoSettleRoundIfComplete } from './round-finalize'

const {
  rooms,
  roomMembers,
  rounds,
  roundParticipants,
  chipLedger,
  roundFairness,
  roundFairnessParticipants,
} = schema

export async function startRound(
  roomId: string,
): Promise<ActionResult<{ roundId: string; seq: number }>> {
  const userId = await currentUserId()
  if (!userId) return fail('errors.loginRequired')
  if (!z.string().uuid().safeParse(roomId).success) return fail('errors.invalidRoom')

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)
      if (!(await requireRole(tx, roomId, userId, ['host', 'dealer']))) {
        return fail('errors.dealerOrHostOnlyStartRound')
      }

      const [room] = await tx.select().from(rooms).where(eq(rooms.id, roomId)).limit(1)
      if (!room) return fail('errors.roomNotFound')
      if (room.status === 'settled' || room.status === 'closed') return fail('errors.roomEnded')

      const participants = await tx
        .select({ userId: roomMembers.userId, seatNo: roomMembers.seatNo })
        .from(roomMembers)
        .where(
          and(
            eq(roomMembers.roomId, roomId),
            isNull(roomMembers.leftAt),
            ne(roomMembers.role, 'observer'),
          ),
        )
        .orderBy(asc(roomMembers.seatNo))
      if (participants.length < 2) return fail('errors.roundNeedsTwoPlayers')

      const [playing] = await tx
        .select({ id: rounds.id })
        .from(rounds)
        .where(and(eq(rounds.roomId, roomId), eq(rounds.status, 'playing')))
        .limit(1)
      if (playing) return fail('errors.roundAlreadyActive')

      const [maxSeq] = await tx
        .select({ max: sql<number>`coalesce(max(${rounds.seq}), 0)` })
        .from(rounds)
        .where(eq(rounds.roomId, roomId))
      const seq = (maxSeq?.max ?? 0) + 1

      const fairPlay = readFairPlaySettings(room.gameType, room.rulePreset)
      const verifiedSeotda = fairPlay.dealing === 'verified' && room.gameType === 'seotda'
      const roundId = crypto.randomUUID()
      const fairSeed = verifiedSeotda ? generateFairnessSeed() : null
      const [serverSeedCommitment, serverSeedCiphertext] = fairSeed
        ? await Promise.all([
            commitServerSeed(roundId, fairSeed),
            Promise.resolve(encryptFairnessServerSeed(fairSeed)),
          ])
        : [null, null]
      const fairNow = verifiedSeotda ? await fairDatabaseNow(tx) : null
      const seedDeadline =
        verifiedSeotda && fairNow
          ? new Date(fairNow.getTime() + fairPlay.seedCollectionSeconds * 1_000)
          : null

      const [round] = await tx
        .insert(rounds)
        .values({ id: roundId, roomId, seq })
        .returning({ id: rounds.id, seq: rounds.seq })
      if (!round) return fail('errors.createRoundFailed')
      await tx.insert(roundParticipants).values(
        participants.map((participant) => ({
          roundId: round.id,
          userId: participant.userId,
        })),
      )
      if (serverSeedCommitment && serverSeedCiphertext && seedDeadline) {
        await tx.insert(roundFairness).values({
          roundId: round.id,
          algorithmVersion: FAIRNESS_ALGORITHM_VERSION,
          receiptVersion: FAIRNESS_PUBLIC_RECEIPT_VERSION,
          serverSeedCiphertext,
          serverSeedCommitment,
          seedDeadline,
        })
        await tx.insert(roundFairnessParticipants).values(
          participants.map((participant, dealOrder) => ({
            roundId: round.id,
            userId: participant.userId,
            dealOrder,
          })),
        )
      }

      if (room.status === 'waiting') {
        await tx.update(rooms).set({ status: 'playing' }).where(eq(rooms.id, roomId))
      }

      return ok({ roundId: round.id, seq: round.seq })
    })
  } catch (error) {
    console.error('startRound failed:', error)
    return fail('errors.startRoundFailed')
  }
}

const loserPenaltySchema = z.object({
  userId: z.string().uuid(),
  factor: z.union([z.literal(1), z.literal(2), z.literal(4)]),
})

const endRoundSchema = z.object({
  roomId: z.string().uuid(),
  winnerId: z.string().uuid().optional(),
  note: z.string().trim().max(60).optional(),
  score: z.number().int().min(1).max(999).optional(),
  loserPenalties: z
    .array(loserPenaltySchema)
    .max(9)
    .refine(
      (penalties) => new Set(penalties.map((penalty) => penalty.userId)).size === penalties.length,
    )
    .optional(),
})

export async function endRound(
  input: z.infer<typeof endRoundSchema>,
): Promise<ActionResult<{ seq: number; pot: number; winnerId: string }>> {
  const userId = await currentUserId()
  if (!userId) return fail('errors.loginRequired')

  const parsed = endRoundSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')
  const { roomId, winnerId: requestedWinnerId, note, score, loserPenalties } = parsed.data

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)
      if (!(await requireRole(tx, roomId, userId, ['host', 'dealer']))) {
        return fail('errors.dealerOrHostOnlyEndRound')
      }

      const [room] = await tx.select().from(rooms).where(eq(rooms.id, roomId)).limit(1)
      if (!room) return fail('errors.roomNotFound')
      const isGostop = room.gameType === 'gostop'
      if (isGostop && !score) return fail('errors.gostopScoreRequired')

      const [round] = await tx
        .select()
        .from(rounds)
        .where(and(eq(rounds.roomId, roomId), eq(rounds.status, 'playing')))
        .orderBy(desc(rounds.seq))
        .limit(1)
      if (!round) return fail('errors.noActiveRound')

      const [fairRoundRow] = await tx
        .select()
        .from(roundFairness)
        .where(eq(roundFairness.roundId, round.id))
        .limit(1)
      const fairRound = fairRoundRow as PersistedFairRound | undefined
      let winnerId = requestedWinnerId
      if (fairRound) {
        if (room.gameType !== 'seotda' || fairRound.phase !== 'sealed') {
          return fail('errors.fairnessDealNotReady')
        }
        const fairParticipants = await loadFairRoundParticipants(tx, round.id)
        const acceptedActions = await tx
          .select({ userId: schema.betActions.userId, action: schema.betActions.action })
          .from(schema.betActions)
          .where(
            and(eq(schema.betActions.roundId, round.id), eq(schema.betActions.status, 'accepted')),
          )
          .orderBy(desc(schema.betActions.seq))
        const lastActionByUser = new Map<string, (typeof acceptedActions)[number]['action']>()
        for (const action of acceptedActions) {
          if (!lastActionByUser.has(action.userId))
            lastActionByUser.set(action.userId, action.action)
        }
        const contenderIds = new Set(
          fairParticipants
            .filter((participant) => lastActionByUser.get(participant.userId) !== 'fold')
            .map((participant) => participant.userId),
        )
        if (contenderIds.size === 0) return fail('errors.winnerNotEligible')
        if (contenderIds.size === 1) {
          winnerId = [...contenderIds][0]
        } else {
          const showdown = await resolvePersistedFairSeotdaShowdown(
            fairRound,
            fairParticipants,
            SEOTDA_RULES_STANDARD,
            contenderIds,
          )
          if (showdown.outcome.kind !== 'win') return fail('errors.fairnessReplayRequired')
          winnerId = showdown.participants[showdown.outcome.winnerIndex]?.userId
        }
        if (!winnerId) throw new Error('Verified Seotda winner index is invalid')
      }
      if (!winnerId) return fail('errors.winnerNotEligible')

      const [winner] = await tx
        .select({ userId: roundParticipants.userId })
        .from(roundParticipants)
        .innerJoin(
          roomMembers,
          and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, roundParticipants.userId)),
        )
        .where(
          and(
            eq(roundParticipants.roundId, round.id),
            eq(roundParticipants.userId, winnerId),
            isNull(roomMembers.leftAt),
            ne(roomMembers.role, 'observer'),
          ),
        )
        .limit(1)
      if (!winner) return fail('errors.winnerNotEligible')

      if (!isGostop) {
        const [winnerLastAction] = await tx
          .select({ action: schema.betActions.action })
          .from(schema.betActions)
          .where(
            and(
              eq(schema.betActions.roundId, round.id),
              eq(schema.betActions.userId, winnerId),
              eq(schema.betActions.status, 'accepted'),
            ),
          )
          .orderBy(desc(schema.betActions.seq))
          .limit(1)
        if (winnerLastAction?.action === 'fold') return fail('errors.foldedPlayerCannotWin')
      }

      const [pending] = await tx
        .select({ id: schema.betActions.id })
        .from(schema.betActions)
        .where(
          and(eq(schema.betActions.roundId, round.id), eq(schema.betActions.status, 'pending')),
        )
        .limit(1)
      if (pending) return fail('errors.pendingBetsBeforeEnd')

      let pot = await getRoundPot(round.id)

      let persistedPenalties: RoundPenaltyView[] = []

      if (isGostop && score) {
        const pointValue = readPointValue(room.rulePreset)

        const penalties = loserPenalties ?? []
        const losers = await tx
          .select({ userId: roundParticipants.userId })
          .from(roundParticipants)
          .where(
            and(eq(roundParticipants.roundId, round.id), ne(roundParticipants.userId, winnerId)),
          )
        const loserIds = new Set(losers.map((loser) => loser.userId))
        if (penalties.some((penalty) => !loserIds.has(penalty.userId))) {
          return fail('errors.invalidLoserData')
        }
        const factorByLoser = new Map(
          penalties.map((penalty) => [penalty.userId, penalty.factor] as const),
        )

        let collected = 0
        for (const loser of losers) {
          const owed = score * pointValue * (factorByLoser.get(loser.userId) ?? 1)
          const balance = await balanceInRoom(tx, roomId, loser.userId)
          const pay = Math.min(balance, owed)
          if (pay <= 0) continue
          collected += pay
          await tx.insert(chipLedger).values({
            roomId,
            roundId: round.id,
            userId: loser.userId,
            delta: -pay,
            reason: 'settlement',
          })
        }

        persistedPenalties = penalties.flatMap((penalty) => {
          if (penalty.factor === 1) return []
          return [{ userId: penalty.userId, factor: penalty.factor }]
        })
        const payout = winnerPayout(pot, collected)
        if (payout > 0) {
          await tx.insert(chipLedger).values({
            roomId,
            roundId: round.id,
            userId: winnerId,
            delta: payout,
            reason: 'pot_win',
          })
        }
        pot = payout
      } else {
        await creditPotToWinner(tx, room, round, winnerId, pot)
      }

      const result =
        note || score || persistedPenalties.length > 0
          ? {
              ...(note ? { note } : {}),
              ...(score ? { score } : {}),
              ...(persistedPenalties.length > 0 ? { penalties: persistedPenalties } : {}),
            }
          : null

      await finalizeRoundRecord(tx, round, winnerId, pot, result)
      await revealFairnessIfNeeded(tx, fairRound, userId)

      return ok({ seq: round.seq, pot, winnerId })
    })
  } catch (error) {
    console.error('endRound failed:', error)
    return fail('errors.endRoundFailed')
  }
}

const voidRoundSchema = z.object({
  roomId: z.string().uuid(),
  reason: z.string().trim().min(1).max(60),
})

export async function voidRound(
  input: z.infer<typeof voidRoundSchema>,
): Promise<ActionResult<{ roundId: string; seq: number }>> {
  const userId = await currentUserId()
  if (!userId) return fail('errors.loginRequired')

  const parsed = voidRoundSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')
  const { roomId, reason } = parsed.data

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)
      if (!(await requireRole(tx, roomId, userId, ['host', 'dealer']))) {
        return fail('errors.dealerOrHostOnlyVoidRound')
      }

      const [playing] = await tx
        .select()
        .from(rounds)
        .where(and(eq(rounds.roomId, roomId), eq(rounds.status, 'playing')))
        .orderBy(desc(rounds.seq))
        .limit(1)

      let round = playing
      if (!round) {
        const [latest] = await tx
          .select()
          .from(rounds)
          .where(eq(rounds.roomId, roomId))
          .orderBy(desc(rounds.seq))
          .limit(1)
        if (!latest || latest.status !== 'ended') return fail('errors.noRoundToVoid')
        round = latest
      }

      const moveRows = await tx
        .select()
        .from(chipLedger)
        .where(
          and(
            eq(chipLedger.roundId, round.id),
            inArray(chipLedger.reason, ['bet', 'pot_win', 'settlement']),
          ),
        )
      const corrected = new Set(
        (
          await tx
            .select({ revertedOf: chipLedger.revertedOf })
            .from(chipLedger)
            .where(and(eq(chipLedger.roundId, round.id), eq(chipLedger.reason, 'correction')))
        ).map((row) => row.revertedOf),
      )

      const refunds = moveRows
        .filter((row) => !corrected.has(row.id))
        .map((row) => ({
          roomId,
          roundId: round.id,
          userId: row.userId,
          delta: -row.delta,
          reason: 'correction' as const,
          refActionId: row.refActionId,
          revertedOf: row.id,
        }))

      const giveBack = new Map<string, number>()
      for (const refund of refunds) {
        if (refund.delta < 0) {
          giveBack.set(refund.userId, (giveBack.get(refund.userId) ?? 0) + refund.delta)
        }
      }
      for (const [memberId, delta] of giveBack) {
        const balance = await balanceInRoom(tx, roomId, memberId)
        if (balance + delta < 0) {
          return fail('errors.refundExceedsBalance')
        }
      }

      if (refunds.length > 0) await tx.insert(chipLedger).values(refunds)

      await tx
        .update(schema.betActions)
        .set({ status: 'reverted', reason })
        .where(
          and(
            eq(schema.betActions.roundId, round.id),
            inArray(schema.betActions.status, ['pending', 'accepted']),
          ),
        )

      await tx
        .update(rounds)
        .set({ status: 'voided', result: { note: reason }, endedAt: new Date() })
        .where(eq(rounds.id, round.id))

      const [fairRoundRow] = await tx
        .select()
        .from(roundFairness)
        .where(eq(roundFairness.roundId, round.id))
        .limit(1)
      const fairRound = fairRoundRow as PersistedFairRound | undefined
      if (fairRound?.phase === 'collecting_seeds') {
        await tx
          .update(roundFairness)
          .set({ phase: 'aborted', abortedAt: await fairDatabaseNow(tx), abortReason: reason })
          .where(
            and(eq(roundFairness.roundId, round.id), eq(roundFairness.phase, 'collecting_seeds')),
          )
      } else if (fairRound?.phase === 'sealed') {
        const fairParticipants = await loadFairRoundParticipants(tx, round.id)
        await revealPersistedFairRound(
          tx,
          fairRound,
          fairParticipants,
          userId,
          await fairDatabaseNow(tx),
        )
      }

      return ok({ roundId: round.id, seq: round.seq })
    })
  } catch (error) {
    console.error('voidRound failed:', error)
    return fail('errors.voidRoundFailed')
  }
}