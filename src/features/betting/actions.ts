'use server'

import { and, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { db, schema } from '@/lib/db'
import { currentUserId } from '../auth/session'
import type { BetActionView } from '../game/types'

const { rooms, roomMembers, rounds, betActions, chipLedger } = schema

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function lockRoom(tx: Tx, roomId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${roomId}, 42))`)
}

async function memberRole(tx: Tx, roomId: string, userId: string): Promise<string | null> {
  const [member] = await tx
    .select({ role: roomMembers.role })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)))
    .limit(1)
  return member?.role ?? null
}

/** placeBet 전용 — 역할에 더해 입장 시각·퇴장 여부까지 본다. */
async function memberInfo(
  tx: Tx,
  roomId: string,
  userId: string,
): Promise<{ role: string; joinedAt: Date; leftAt: Date | null } | null> {
  const [member] = await tx
    .select({
      role: roomMembers.role,
      joinedAt: roomMembers.joinedAt,
      leftAt: roomMembers.leftAt,
    })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)))
    .limit(1)
  return member ?? null
}

async function balanceOf(tx: Tx, roomId: string, userId: string): Promise<number> {
  const [row] = await tx
    .select({ balance: sql<number>`coalesce(sum(${chipLedger.delta}), 0)::int` })
    .from(chipLedger)
    .where(and(eq(chipLedger.roomId, roomId), eq(chipLedger.userId, userId)))
  return row?.balance ?? 0
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
  /** 클라이언트 생성 UUID = 멱등키. 재전송은 기존 행 반환으로 흡수된다. */
  actionId: z.string().uuid(),
  roomId: z.string().uuid(),
  action: z.enum(['check', 'call', 'raise', 'fold', 'allin']),
  amount: z.number().int().min(0).max(10_000_000),
  /** 대리 입력 대상. 생략하면 본인. */
  targetUserId: z.string().uuid().optional(),
})

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

      const [room] = await tx.select().from(rooms).where(eq(rooms.id, roomId)).limit(1)
      if (!room) return fail('errors.roomNotFound')
      // 고스톱은 베팅 없이 판 종료 시 점수로 정산한다.
      if (room.gameType === 'gostop') return fail('errors.gostopScoreOnly')

      const [round] = await tx
        .select()
        .from(rounds)
        .where(and(eq(rounds.roomId, roomId), eq(rounds.status, 'playing')))
        .orderBy(desc(rounds.seq))
        .limit(1)
      if (!round) return fail('errors.noActiveRound')

      // 판 시작 후 입장한 멤버는 이번 판에 참여할 수 없다 — 본인·대리 입력 동일.
      if (target.joinedAt > round.startedAt) {
        return fail('errors.joinedAfterRoundStart')
      }

      // 멱등: 같은 actionId 재전송이면 기존 행을 그대로 돌려준다.
      const [existing] = await tx
        .select()
        .from(betActions)
        .where(eq(betActions.id, actionId))
        .limit(1)
      if (existing) return ok({ action: toView(existing) })

      if (movesChips) {
        const balance = await balanceOf(tx, roomId, userId)
        if (balance < amount) return fail('errors.insufficientBalance')
      }

      // 신뢰 모드는 즉시 확정. 승인 모드에서도 딜러 본인/대리 입력은 즉시 확정.
      const autoAccept = room.inputMode === 'trust' || isDealer

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

      const callerRole = await memberRole(tx, target.roomId, callerId)
      if (callerRole !== 'host' && callerRole !== 'dealer') {
        return fail('errors.dealerOrHostOnlyApprove')
      }

      // 락 이후 상태 재조회 — 다른 딜러가 먼저 처리했을 수 있다.
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

      const movesChips =
        fresh.action === 'call' || fresh.action === 'raise' || fresh.action === 'allin'

      if (movesChips) {
        const balance = await balanceOf(tx, fresh.roomId, fresh.userId)
        if (balance < fresh.amount) {
          // 잔액이 사이에 줄었으면 자동 거절 — 사유를 남긴다.
          const [rejected] = await tx
            .update(betActions)
            .set({ status: 'rejected', approvedBy: callerId, reason: '잔액 부족 (자동 거절)' })
            .where(eq(betActions.id, fresh.id))
            .returning()
          return rejected
            ? ok({ action: toView(rejected) })
            : fail('errors.approveBetProcessFailed')
        }
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
  /** 사유는 필수 — 사유 없는 거절은 분쟁을 만든다. */
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

      const callerRole = await memberRole(tx, target.roomId, callerId)
      if (callerRole !== 'host' && callerRole !== 'dealer') {
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

/** 확정된 베팅 정정 — 원장은 고치지 않고 반대 부호 정정 행을 쌓는다. */
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

      const callerRole = await memberRole(tx, target.roomId, callerId)
      if (callerRole !== 'host' && callerRole !== 'dealer') {
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
