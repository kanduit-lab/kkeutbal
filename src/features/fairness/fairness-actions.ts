'use server'

import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { db, schema } from '@/lib/db'
import { currentUserId } from '../auth/session'
import { lockRoom, readSeotdaCards } from '../game/action-helpers'
import { hashClientSeed } from './protocol'
import {
  fairDatabaseNow,
  loadFairRoundParticipants,
  loadHandChoices,
  reconstructSealedFairRound,
  sealPersistedFairRound,
  type PersistedFairRound,
} from './fair-round-service'
import { privateSeotdaHand, seotdaCardCountOf } from './verified-seotda'
import type { SeotdaCardCount } from '../seotda/types'

const {
  rooms,
  roomMembers,
  rounds,
  roundFairness,
  roundFairnessParticipants,
  roundFairnessReveals,
} = schema

const roundIdSchema = z.string().uuid()
const seedSchema = z.string().regex(/^[0-9a-f]{64}$/i)

export async function submitFairnessSeed(input: {
  roomId: string
  roundId: string
  clientSeed: string
}): Promise<ActionResult<{ roundId: string; submitted: true }>> {
  const userId = await currentUserId()
  if (!userId) return fail('errors.loginRequired')
  if (
    !roundIdSchema.safeParse(input.roundId).success ||
    !roundIdSchema.safeParse(input.roomId).success
  ) {
    return fail('errors.invalidInput')
  }
  if (!seedSchema.safeParse(input.clientSeed).success) return fail('errors.invalidInput')

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, input.roomId)
      const [round] = await tx
        .select({ id: rounds.id })
        .from(rounds)
        .where(
          and(
            eq(rounds.id, input.roundId),
            eq(rounds.roomId, input.roomId),
            eq(rounds.status, 'playing'),
          ),
        )
        .limit(1)
      if (!round) return fail('errors.noActiveRound')

      const [fairRound] = await tx
        .select()
        .from(roundFairness)
        .where(eq(roundFairness.roundId, input.roundId))
        .limit(1)
      if (!fairRound || fairRound.phase !== 'collecting_seeds')
        return fail('errors.fairnessNotCollecting')

      const now = await fairDatabaseNow(tx)
      const clientSeedHash = await hashClientSeed(input.roundId, userId, input.clientSeed)
      const [participant] = await tx
        .select({ clientSeedHash: roundFairnessParticipants.clientSeedHash })
        .from(roundFairnessParticipants)
        .where(
          and(
            eq(roundFairnessParticipants.roundId, input.roundId),
            eq(roundFairnessParticipants.userId, userId),
          ),
        )
        .limit(1)
      if (!participant) return fail('errors.fairnessNotParticipant')
      if (participant.clientSeedHash === clientSeedHash)
        return ok({ roundId: input.roundId, submitted: true })
      if (participant.clientSeedHash !== null) return fail('errors.fairnessSeedAlreadyCommitted')
      if (now.getTime() >= fairRound.seedDeadline.getTime())
        return fail('errors.fairnessSeedDeadlineReached')

      await tx
        .update(roundFairnessParticipants)
        .set({ clientSeedHash, seedSubmittedAt: now })
        .where(
          and(
            eq(roundFairnessParticipants.roundId, input.roundId),
            eq(roundFairnessParticipants.userId, userId),
            isNull(roundFairnessParticipants.clientSeedHash),
          ),
        )
      return ok({ roundId: input.roundId, submitted: true })
    })
  } catch (error) {
    console.error('submitFairnessSeed failed:', error)
    return fail('errors.fairnessSeedSubmitFailed')
  }
}

export async function sealFairnessRound(
  roomId: string,
  roundId: string,
): Promise<ActionResult<{ roundId: string; sealed: true }>> {
  const userId = await currentUserId()
  if (!userId) return fail('errors.loginRequired')
  if (!roundIdSchema.safeParse(roomId).success || !roundIdSchema.safeParse(roundId).success) {
    return fail('errors.invalidInput')
  }

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)
      const [round] = await tx
        .select({ id: rounds.id })
        .from(rounds)
        .where(and(eq(rounds.id, roundId), eq(rounds.roomId, roomId), eq(rounds.status, 'playing')))
        .limit(1)
      if (!round) return fail('errors.noActiveRound')
      const [membership] = await tx
        .select({ userId: roomMembers.userId })
        .from(roomMembers)
        .innerJoin(
          roundFairnessParticipants,
          and(
            eq(roundFairnessParticipants.roundId, roundId),
            eq(roundFairnessParticipants.userId, roomMembers.userId),
          ),
        )
        .where(
          and(
            eq(roomMembers.roomId, roomId),
            eq(roomMembers.userId, userId),
            isNull(roomMembers.leftAt),
          ),
        )
        .limit(1)
      if (!membership) return fail('errors.fairnessNotParticipant')

      const [fairRound] = await tx
        .select()
        .from(roundFairness)
        .where(eq(roundFairness.roundId, roundId))
        .limit(1)
      if (!fairRound) return fail('errors.fairnessNotEnabled')
      if (fairRound.phase === 'sealed' || fairRound.phase === 'revealed') {
        return ok({ roundId, sealed: true })
      }
      if (fairRound.phase !== 'collecting_seeds') return fail('errors.fairnessNotCollecting')

      const [room] = await tx
        .select({ rulePreset: rooms.rulePreset })
        .from(rooms)
        .where(eq(rooms.id, roomId))
        .limit(1)
      if (!room) return fail('errors.roomNotFound')

      const participants = await loadFairRoundParticipants(tx, roundId)
      await sealPersistedFairRound(
        tx,
        fairRound,
        participants,
        await fairDatabaseNow(tx),
        readSeotdaCards(room.rulePreset),
      )
      return ok({ roundId, sealed: true })
    })
  } catch (error) {
    console.error('sealFairnessRound failed:', error)
    return fail('errors.fairnessSealFailed')
  }
}

export async function getMyVerifiedSeotdaHand(
  roomId: string,
  roundId: string,
): Promise<
  ActionResult<{
    cards: readonly { id: string; month: number; label: string }[]
    /** 이 판에서 받게 되는 카드 수. 3장 방의 1차 베팅 중에는 `cards`가 이보다 적다 */
    cardCount: SeotdaCardCount
    chosenCardIds: readonly string[] | null
  }>
> {
  const userId = await currentUserId()
  if (!userId) return fail('errors.loginRequired')
  if (!roundIdSchema.safeParse(roomId).success || !roundIdSchema.safeParse(roundId).success) {
    return fail('errors.invalidInput')
  }

  try {
    const result = await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)
      const [round] = await tx
        .select({ id: rounds.id, roomId: rounds.roomId, street: rounds.street })
        .from(rounds)
        .where(and(eq(rounds.id, roundId), eq(rounds.roomId, roomId), eq(rounds.status, 'playing')))
        .limit(1)
      if (!round) return null
      const [fairRound] = await tx
        .select()
        .from(roundFairness)
        .where(eq(roundFairness.roundId, roundId))
        .limit(1)
      if (!fairRound) return null
      const participants = await loadFairRoundParticipants(tx, roundId)
      if (!participants.some((participant) => participant.userId === userId)) return undefined
      const deal = await reconstructSealedFairRound(fairRound, participants)
      const cardCount = seotdaCardCountOf(deal.publicReceipt.game)
      const hand = privateSeotdaHand(
        deal.shuffle.shuffledDeckIds,
        deal.participants,
        userId,
        cardCount,
      )
      // 3번째 장은 2차 베팅이 시작되기 전까지 어떤 응답에도 실리지 않는다.
      const visible = round.street === 1 ? hand.slice(0, 2) : hand
      const choices = await loadHandChoices(tx, roundId)
      return {
        cards: visible.map((card) => ({ id: card.id, month: card.month, label: card.label })),
        cardCount,
        chosenCardIds: choices.get(userId) ?? null,
      }
    })
    if (result === undefined) return fail('errors.fairnessNotParticipant')
    if (result === null) return fail('errors.fairnessDealNotReady')
    return ok(result)
  } catch (error) {
    console.error('getMyVerifiedSeotdaHand failed:', error)
    return fail('errors.fairnessHandFailed')
  }
}

export async function getVerifiedFairnessAudit(
  roomId: string,
  roundId: string,
): Promise<ActionResult<{ publicReceipt: unknown; fullReceipt: unknown }>> {
  const userId = await currentUserId()
  if (!userId) return fail('errors.loginRequired')
  if (!roundIdSchema.safeParse(roomId).success || !roundIdSchema.safeParse(roundId).success) {
    return fail('errors.invalidInput')
  }

  try {
    const [fairRound, participant, reveal] = await Promise.all([
      db.select().from(roundFairness).where(eq(roundFairness.roundId, roundId)).limit(1),
      db
        .select({ userId: roundFairnessParticipants.userId })
        .from(roundFairnessParticipants)
        .innerJoin(rounds, eq(rounds.id, roundFairnessParticipants.roundId))
        .where(
          and(
            eq(roundFairnessParticipants.roundId, roundId),
            eq(roundFairnessParticipants.userId, userId),
            eq(rounds.roomId, roomId),
          ),
        )
        .limit(1),
      db
        .select()
        .from(roundFairnessReveals)
        .where(eq(roundFairnessReveals.roundId, roundId))
        .limit(1),
    ])
    if (!participant[0]) return fail('errors.fairnessNotParticipant')
    const header = fairRound[0] as PersistedFairRound | undefined
    const fullReveal = reveal[0]
    if (!header || header.phase !== 'revealed' || !header.publicReceipt || !fullReveal) {
      return fail('errors.fairnessAuditNotReady')
    }
    return ok({ publicReceipt: header.publicReceipt, fullReceipt: fullReveal.fullReceipt })
  } catch (error) {
    console.error('getVerifiedFairnessAudit failed:', error)
    return fail('errors.fairnessAuditFailed')
  }
}