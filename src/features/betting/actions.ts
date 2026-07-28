'use server'

import { and, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm'
import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { db, schema } from '@/lib/db'
import { currentUserId } from '../auth/session'
import {
  balanceInRoom,
  defaultBaseBet,
  lockRoom,
  readBaseBet,
  requireRole,
  type Tx,
} from '../game/action-helpers'
import type { BetActionView } from '../game/types'
import { minimumRaiseAmount, neededToCall, roundBetState } from './round-bet-state'

const { rooms, roomMembers, rounds, roundParticipants, betActions, chipLedger } = schema

async function memberInfo(
  tx: Tx,
  roomId: string,
  userId: string,
): Promise<{ role: string; leftAt: Date | null } | null> {
  const [member] = await tx
    .select({
      role: roomMembers.role,
      leftAt: roomMembers.leftAt,
    })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)))
    .limit(1)
  return member ?? null
}

function toView(action: typeof betActions.$inferSelect): BetActionView {
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

const placeBetSchema = z.object({
  actionId: z.string().uuid(),
  roomId: z.string().uuid(),
  action: z.enum(['check', 'call', 'raise', 'fold', 'allin']),
  amount: z.number().int().min(0).max(10_000_000),
  targetUserId: z.string().uuid().optional(),
})

type BetKind = z.infer<typeof placeBetSchema>['action']

async function validateBetSemantics(
  tx: Tx,
  input: {
    room: typeof rooms.$inferSelect
    roundId: string
    userId: string
    action: BetKind
    amount: number
    beforeSeq?: number
  },
): Promise<string | null> {
  const { room, roundId, userId, action, amount, beforeSeq } = input
  const before = beforeSeq === undefined ? undefined : lt(betActions.seq, beforeSeq)

  const [lastUserAction] = await tx
    .select({ action: betActions.action })
    .from(betActions)
    .where(
      and(
        eq(betActions.roundId, roundId),
        eq(betActions.userId, userId),
        eq(betActions.status, 'accepted'),
        before,
      ),
    )
    .orderBy(desc(betActions.seq))
    .limit(1)
  if (lastUserAction?.action === 'fold') return 'errors.cannotBetAfterFold'
  if (lastUserAction?.action === 'allin') return 'errors.cannotBetAfterAllIn'

  const acceptedActions = await tx
    .select({
      userId: betActions.userId,
      action: betActions.action,
      amount: betActions.amount,
      status: betActions.status,
    })
    .from(betActions)
    .where(and(eq(betActions.roundId, roundId), eq(betActions.status, 'accepted'), before))

  const state = roundBetState(acceptedActions)
  const callNeeded = neededToCall(state, userId)
  const balance = await balanceInRoom(tx, room.id, userId)
  if (action === 'check') return callNeeded === 0 ? null : 'errors.cannotCheckAfterBet'
  if (action === 'fold') return null
  if (balance < 1) return 'errors.insufficientBalance'

  if (action === 'allin') {
    return amount === balance ? null : 'errors.allInMustUseFullBalance'
  }
  if (amount > balance) return 'errors.insufficientBalance'

  if (action === 'call') {
    if (callNeeded === 0) return 'errors.noBetToCall'
    return amount === Math.min(callNeeded, balance) ? null : 'errors.invalidCallAmount'
  }

  const baseBet = readBaseBet(room.rulePreset) ?? defaultBaseBet(room.startingChips)
  const minRaise = minimumRaiseAmount(state, userId, baseBet)
  if (amount < minRaise) return 'errors.raiseBelowMinimum'
  if (amount === balance) return 'errors.allInMustUseAllInAction'
  return null
}

export async function placeBet(
  input: z.infer<typeof placeBetSchema>,
): Promise<ActionResult<{ action: BetActionView }>> {
  const callerId = await currentUserId()
  if (!callerId) return fail('errors.loginRequired')

  const parsed = placeBetSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')
  const { actionId, roomId, action, targetUserId } = parsed.data

  const movesChips = action === 'call' || action === 'raise' || action === 'allin'
  const amount = movesChips ? parsed.data.amount : 0
  if (movesChips && amount < 1) return fail('errors.betAmountRequired')

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)

      const caller = await memberInfo(tx, roomId, callerId)
      if (!caller || caller.leftAt) return fail('errors.notMember')

      const userId = targetUserId ?? callerId
      const isProxy = userId !== callerId
      const isDealer = caller.role === 'host' || caller.role === 'dealer'
      if (isProxy && !isDealer) return fail('errors.proxyDealerOnly')

      const target = isProxy ? await memberInfo(tx, roomId, userId) : caller
      if (!target || target.leftAt) return fail('errors.targetNotMember')
      if (target.role === 'observer') return fail('errors.observerCannotBet')

      const [existing] = await tx
        .select()
        .from(betActions)
        .where(eq(betActions.id, actionId))
        .limit(1)
      if (existing) {
        const enteredBy = isProxy ? callerId : null
        if (
          existing.roomId !== roomId ||
          existing.userId !== userId ||
          existing.enteredBy !== enteredBy ||
          existing.action !== action ||
          existing.amount !== amount
        ) {
          return fail('errors.actionIdConflict')
        }
        return ok({ action: toView(existing) })
      }

      const [room] = await tx.select().from(rooms).where(eq(rooms.id, roomId)).limit(1)
      if (!room) return fail('errors.roomNotFound')

      if (room.gameType === 'gostop') return fail('errors.gostopScoreOnly')

      const [round] = await tx
        .select()
        .from(rounds)
        .where(and(eq(rounds.roomId, roomId), eq(rounds.status, 'playing')))
        .orderBy(desc(rounds.seq))
        .limit(1)
      if (!round) return fail('errors.noActiveRound')

      const [participant] = await tx
        .select({ userId: roundParticipants.userId })
        .from(roundParticipants)
        .where(and(eq(roundParticipants.roundId, round.id), eq(roundParticipants.userId, userId)))
        .limit(1)
      if (!participant) {
        return fail('errors.joinedAfterRoundStart')
      }

      const [pending] = await tx
        .select({ id: betActions.id })
        .from(betActions)
        .where(
          and(
            eq(betActions.roundId, round.id),
            eq(betActions.userId, userId),
            eq(betActions.status, 'pending'),
          ),
        )
        .limit(1)
      if (pending) return fail('errors.pendingActionExists')

      const semanticError = await validateBetSemantics(tx, {
        room,
        roundId: round.id,
        userId,
        action,
        amount,
      })
      if (semanticError) return fail(semanticError)

      const autoAccept = room.inputMode === 'trust' || isDealer
      if (autoAccept && room.inputMode === 'approval') {
        const [earlierPending] = await tx
          .select({ id: betActions.id })
          .from(betActions)
          .where(and(eq(betActions.roundId, round.id), eq(betActions.status, 'pending')))
          .limit(1)
        if (earlierPending) return fail('errors.pendingBetsBeforeNewAction')
      }

      const [seqRow] = await tx
        .select({ max: sql<number>`coalesce(max(${betActions.seq}), 0)` })
        .from(betActions)
        .where(eq(betActions.roundId, round.id))
      const seq = (seqRow?.max ?? 0) + 1

      const [inserted] = await tx
        .insert(betActions)
        .values({
          id: actionId,
          roomId,
          roundId: round.id,
          userId,
          enteredBy: isProxy ? callerId : null,
          action,
          amount,
          status: autoAccept ? 'accepted' : 'pending',
          approvedBy: autoAccept && room.inputMode === 'approval' ? callerId : null,
          seq,
        })
        .returning()
      if (!inserted) return fail('errors.placeBetRecordFailed')

      if (autoAccept && movesChips) {
        await tx.insert(chipLedger).values({
          roomId,
          roundId: round.id,
          userId,
          delta: -amount,
          reason: 'bet',
          refActionId: actionId,
        })
      }

      return ok({ action: toView(inserted) })
    })
  } catch (error) {
    console.error('placeBet failed:', error)
    return fail('errors.placeBetFailed')
  }
}

const approveSchema = z.object({ actionId: z.string().uuid() })

export async function approveBet(
  input: z.infer<typeof approveSchema>,
): Promise<ActionResult<{ action: BetActionView }>> {
  const callerId = await currentUserId()
  if (!callerId) return fail('errors.loginRequired')

  const parsed = approveSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')

  try {
    return await db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(betActions)
        .where(eq(betActions.id, parsed.data.actionId))
        .limit(1)
      if (!target) return fail('errors.actionNotFound')

      await lockRoom(tx, target.roomId)

      if (!(await requireRole(tx, target.roomId, callerId, ['host', 'dealer']))) {
        return fail('errors.dealerOrHostOnlyApprove')
      }

      const [fresh] = await tx
        .select()
        .from(betActions)
        .where(eq(betActions.id, target.id))
        .limit(1)
      if (!fresh || fresh.status !== 'pending') return fail('errors.actionAlreadyProcessed')

      const [round] = await tx
        .select({ status: rounds.status })
        .from(rounds)
        .where(eq(rounds.id, fresh.roundId))
        .limit(1)
      if (round?.status !== 'playing') return fail('errors.roundAlreadyEnded')

      const [earlierPending] = await tx
        .select({ id: betActions.id })
        .from(betActions)
        .where(
          and(
            eq(betActions.roundId, fresh.roundId),
            eq(betActions.status, 'pending'),
            lt(betActions.seq, fresh.seq),
          ),
        )
        .limit(1)
      if (earlierPending) return fail('errors.approvePendingInOrder')

      const [activeTarget] = await tx
        .select({ id: roomMembers.userId })
        .from(roomMembers)
        .innerJoin(
          roundParticipants,
          and(
            eq(roundParticipants.roundId, fresh.roundId),
            eq(roundParticipants.userId, roomMembers.userId),
          ),
        )
        .where(
          and(
            eq(roomMembers.roomId, fresh.roomId),
            eq(roomMembers.userId, fresh.userId),
            isNull(roomMembers.leftAt),
          ),
        )
        .limit(1)

      const movesChips =
        fresh.action === 'call' || fresh.action === 'raise' || fresh.action === 'allin'

      const [room] = await tx.select().from(rooms).where(eq(rooms.id, fresh.roomId)).limit(1)
      if (!room) return fail('errors.roomNotFound')
      const semanticError = activeTarget
        ? await validateBetSemantics(tx, {
            room,
            roundId: fresh.roundId,
            userId: fresh.userId,
            action: fresh.action,
            amount: fresh.amount,
            beforeSeq: fresh.seq,
          })
        : 'errors.targetNotMember'
      if (semanticError) {
        const [rejected] = await tx
          .update(betActions)
          .set({ status: 'rejected', approvedBy: callerId, reason: semanticError })
          .where(and(eq(betActions.id, fresh.id), eq(betActions.status, 'pending')))
          .returning()
        return rejected ? ok({ action: toView(rejected) }) : fail('errors.approveBetProcessFailed')
      }

      const [updated] = await tx
        .update(betActions)
        .set({ status: 'accepted', approvedBy: callerId })
        .where(eq(betActions.id, fresh.id))
        .returning()
      if (!updated) return fail('errors.approveBetFailed')

      if (movesChips) {
        await tx.insert(chipLedger).values({
          roomId: fresh.roomId,
          roundId: fresh.roundId,
          userId: fresh.userId,
          delta: -fresh.amount,
          reason: 'bet',
          refActionId: fresh.id,
        })
      }

      return ok({ action: toView(updated) })
    })
  } catch (error) {
    console.error('approveBet failed:', error)
    return fail('errors.approveBetFailed')
  }
}

const rejectSchema = z.object({
  actionId: z.string().uuid(),
  reason: z.string().trim().min(1).max(200),
})

export async function rejectBet(
  input: z.infer<typeof rejectSchema>,
): Promise<ActionResult<{ action: BetActionView }>> {
  const callerId = await currentUserId()
  if (!callerId) return fail('errors.loginRequired')

  const parsed = rejectSchema.safeParse(input)
  if (!parsed.success) return fail('errors.rejectReasonRequired')

  try {
    return await db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(betActions)
        .where(eq(betActions.id, parsed.data.actionId))
        .limit(1)
      if (!target) return fail('errors.actionNotFound')

      await lockRoom(tx, target.roomId)

      if (!(await requireRole(tx, target.roomId, callerId, ['host', 'dealer']))) {
        return fail('errors.dealerOrHostOnlyReject')
      }

      const [updated] = await tx
        .update(betActions)
        .set({ status: 'rejected', approvedBy: callerId, reason: parsed.data.reason })
        .where(and(eq(betActions.id, target.id), eq(betActions.status, 'pending')))
        .returning()
      if (!updated) return fail('errors.actionAlreadyProcessed')

      return ok({ action: toView(updated) })
    })
  } catch (error) {
    console.error('rejectBet failed:', error)
    return fail('errors.rejectBetFailed')
  }
}

const revertSchema = z.object({
  actionId: z.string().uuid(),
  reason: z.string().trim().min(1).max(200),
})

export async function revertBet(
  input: z.infer<typeof revertSchema>,
): Promise<ActionResult<{ action: BetActionView }>> {
  const callerId = await currentUserId()
  if (!callerId) return fail('errors.loginRequired')

  const parsed = revertSchema.safeParse(input)
  if (!parsed.success) return fail('errors.revertReasonRequired')

  try {
    return await db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(betActions)
        .where(eq(betActions.id, parsed.data.actionId))
        .limit(1)
      if (!target) return fail('errors.actionNotFound')

      await lockRoom(tx, target.roomId)

      if (!(await requireRole(tx, target.roomId, callerId, ['host', 'dealer']))) {
        return fail('errors.dealerOrHostOnlyRevert')
      }

      const [round] = await tx
        .select({ status: rounds.status })
        .from(rounds)
        .where(eq(rounds.id, target.roundId))
        .limit(1)
      if (round?.status !== 'playing') {
        return fail('errors.cannotRevertEndedRound')
      }

      const [laterAccepted] = await tx
        .select({ id: betActions.id })
        .from(betActions)
        .where(
          and(
            eq(betActions.roundId, target.roundId),
            eq(betActions.status, 'accepted'),
            gt(betActions.seq, target.seq),
          ),
        )
        .limit(1)
      if (laterAccepted) return fail('errors.revertLatestFirst')

      const [updated] = await tx
        .update(betActions)
        .set({ status: 'reverted', reason: parsed.data.reason })
        .where(and(eq(betActions.id, target.id), eq(betActions.status, 'accepted')))
        .returning()
      if (!updated) return fail('errors.onlyAcceptedCanRevert')

      const [ledgerRow] = await tx
        .select()
        .from(chipLedger)
        .where(and(eq(chipLedger.refActionId, target.id), eq(chipLedger.reason, 'bet')))
        .limit(1)
      if (ledgerRow) {
        await tx.insert(chipLedger).values({
          roomId: target.roomId,
          roundId: target.roundId,
          userId: target.userId,
          delta: -ledgerRow.delta,
          reason: 'correction',
          refActionId: target.id,
          revertedOf: ledgerRow.id,
        })
      }

      return ok({ action: toView(updated) })
    })
  } catch (error) {
    console.error('revertBet failed:', error)
    return fail('errors.revertBetFailed')
  }
}