'use server'

import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { db, schema } from '@/lib/db'
import { currentUserId } from '../auth/session'
import { lockRoom, requireRole } from '../game/action-helpers'
import { autoSettleRoundIfComplete } from '../game/round-finalize'
import type { BetActionView } from '../game/types'
import { toView, type RoundEndedFromBet } from './bet-view'
import {
  findActiveRoundForRoom,
  findActiveTargetParticipant,
  findBetActionById,
  findBetLedgerRow,
  findLaterAcceptedBet,
  findNextBetSeq,
  findPendingBetForUser,
  findRoomById,
  findRoundById,
  findRoundParticipant,
  hasEarlierPendingBet,
  hasPendingBetInRound,
  memberInfo,
} from './bet-queries'
import { validateBetSemantics } from './bet-semantics'

const { betActions, chipLedger } = schema

const placeBetSchema = z.object({
  actionId: z.string().uuid(),
  roomId: z.string().uuid(),
  action: z.enum(['check', 'call', 'raise', 'fold', 'allin']),
  amount: z.number().int().min(0).max(10_000_000),
  targetUserId: z.string().uuid().optional(),
})

export async function placeBet(
  input: z.infer<typeof placeBetSchema>,
): Promise<ActionResult<{ action: BetActionView; roundEnded?: RoundEndedFromBet }>> {
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

      const existing = await findBetActionById(tx, actionId)
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

      const room = await findRoomById(tx, roomId)
      if (!room) return fail('errors.roomNotFound')

      if (room.gameType === 'gostop') return fail('errors.gostopScoreOnly')

      const round = await findActiveRoundForRoom(tx, roomId)
      if (!round) return fail('errors.noActiveRound')

      const participant = await findRoundParticipant(tx, round.id, userId)
      if (!participant) {
        return fail('errors.joinedAfterRoundStart')
      }

      const pending = await findPendingBetForUser(tx, round.id, userId)
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
        const earlierPending = await hasPendingBetInRound(tx, round.id)
        if (earlierPending) return fail('errors.pendingBetsBeforeNewAction')
      }

      const seq = await findNextBetSeq(tx, round.id)

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

      // 이 액션이 accept됐으니 판이 자동 종료 조건(1인 생존·콜 완료)에 들었는지 바로 확인한다 —
      // 딜러가 "🏁 종료"를 누를 때까지 기다리지 않는다(docs/12-handoff.md 9번).
      const roundEnded = autoAccept
        ? ((await autoSettleRoundIfComplete(tx, room, round, callerId)) ?? undefined)
        : undefined

      return ok({ action: toView(inserted), roundEnded })
    })
  } catch (error) {
    console.error('placeBet failed:', error)
    return fail('errors.placeBetFailed')
  }
}

const approveSchema = z.object({ actionId: z.string().uuid() })

export async function approveBet(
  input: z.infer<typeof approveSchema>,
): Promise<ActionResult<{ action: BetActionView; roundEnded?: RoundEndedFromBet }>> {
  const callerId = await currentUserId()
  if (!callerId) return fail('errors.loginRequired')

  const parsed = approveSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')

  try {
    return await db.transaction(async (tx) => {
      const target = await findBetActionById(tx, parsed.data.actionId)
      if (!target) return fail('errors.actionNotFound')

      await lockRoom(tx, target.roomId)

      if (!(await requireRole(tx, target.roomId, callerId, ['host', 'dealer']))) {
        return fail('errors.dealerOrHostOnlyApprove')
      }

      const fresh = await findBetActionById(tx, target.id)
      if (!fresh || fresh.status !== 'pending') return fail('errors.actionAlreadyProcessed')

      const round = await findRoundById(tx, fresh.roundId)
      if (round?.status !== 'playing') return fail('errors.roundAlreadyEnded')

      const earlierPending = await hasEarlierPendingBet(tx, fresh.roundId, fresh.seq)
      if (earlierPending) return fail('errors.approvePendingInOrder')

      const activeTarget = await findActiveTargetParticipant(
        tx,
        fresh.roomId,
        fresh.roundId,
        fresh.userId,
      )

      const movesChips =
        fresh.action === 'call' || fresh.action === 'raise' || fresh.action === 'allin'

      const room = await findRoomById(tx, fresh.roomId)
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

      // 이 승인으로 판이 자동 종료 조건에 들었는지 확인한다 — placeBet과 동일한 이유
      // (docs/12-handoff.md 9번). 승인 대기 큐의 다른 항목이 남아 있으면 내부적으로 미룬다.
      const roundEnded =
        (await autoSettleRoundIfComplete(tx, room, { id: round.id, seq: round.seq }, callerId)) ??
        undefined

      return ok({ action: toView(updated), roundEnded })
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
      const target = await findBetActionById(tx, parsed.data.actionId)
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
      const target = await findBetActionById(tx, parsed.data.actionId)
      if (!target) return fail('errors.actionNotFound')

      await lockRoom(tx, target.roomId)

      if (!(await requireRole(tx, target.roomId, callerId, ['host', 'dealer']))) {
        return fail('errors.dealerOrHostOnlyRevert')
      }

      const round = await findRoundById(tx, target.roundId)
      if (round?.status !== 'playing') {
        return fail('errors.cannotRevertEndedRound')
      }

      const laterAccepted = await findLaterAcceptedBet(tx, target.roundId, target.seq)
      if (laterAccepted) return fail('errors.revertLatestFirst')

      const [updated] = await tx
        .update(betActions)
        .set({ status: 'reverted', reason: parsed.data.reason })
        .where(and(eq(betActions.id, target.id), eq(betActions.status, 'accepted')))
        .returning()
      if (!updated) return fail('errors.onlyAcceptedCanRevert')

      const ledgerRow = await findBetLedgerRow(tx, target.id)
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
