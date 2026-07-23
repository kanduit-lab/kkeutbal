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
  if (!callerId) return fail('로그인이 필요합니다')

  const parsed = placeBetSchema.safeParse(input)
  if (!parsed.success) return fail('입력값이 올바르지 않습니다')
  const { actionId, roomId, action, targetUserId } = parsed.data

  const movesChips = action === 'call' || action === 'raise' || action === 'allin'
  const amount = movesChips ? parsed.data.amount : 0
  if (movesChips && amount < 1) return fail('베팅 금액을 입력하세요')

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)

      const caller = await memberInfo(tx, roomId, callerId)
      if (!caller || caller.leftAt) return fail('이 방의 참가자가 아닙니다')

      const userId = targetUserId ?? callerId
      const isProxy = userId !== callerId
      const isDealer = caller.role === 'host' || caller.role === 'dealer'
      if (isProxy && !isDealer) return fail('대리 입력은 딜러만 할 수 있습니다')

      const target = isProxy ? await memberInfo(tx, roomId, userId) : caller
      if (!target || target.leftAt) return fail('대상이 방 참가자가 아닙니다')
      if (target.role === 'observer') return fail('관전자는 베팅할 수 없습니다')

      const [room] = await tx.select().from(rooms).where(eq(rooms.id, roomId)).limit(1)
      if (!room) return fail('방을 찾을 수 없습니다')
      // 고스톱은 베팅 없이 판 종료 시 점수로 정산한다.
      if (room.gameType === 'gostop') return fail('고스톱 방은 점수로 정산합니다')

      const [round] = await tx
        .select()
        .from(rounds)
        .where(and(eq(rounds.roomId, roomId), eq(rounds.status, 'playing')))
        .orderBy(desc(rounds.seq))
        .limit(1)
      if (!round) return fail('진행 중인 판이 없습니다')

      // 판 시작 후 입장한 멤버는 이번 판에 참여할 수 없다 — 본인·대리 입력 동일.
      if (target.joinedAt > round.startedAt) {
        return fail('이번 판 시작 후 입장했습니다 — 다음 판부터 참여할 수 있어요')
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
        if (balance < amount) return fail(`잔액 부족 (잔액 ${balance.toLocaleString()})`)
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
      if (!inserted) return fail('베팅 기록에 실패했습니다')

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
    return fail('베팅에 실패했습니다')
  }
}

const approveSchema = z.object({ actionId: z.string().uuid() })

export async function approveBet(
  input: z.infer<typeof approveSchema>,
): Promise<ActionResult<{ action: BetActionView }>> {
  const callerId = await currentUserId()
  if (!callerId) return fail('로그인이 필요합니다')

  const parsed = approveSchema.safeParse(input)
  if (!parsed.success) return fail('입력값이 올바르지 않습니다')

  try {
    return await db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(betActions)
        .where(eq(betActions.id, parsed.data.actionId))
        .limit(1)
      if (!target) return fail('액션을 찾을 수 없습니다')

      await lockRoom(tx, target.roomId)

      const callerRole = await memberRole(tx, target.roomId, callerId)
      if (callerRole !== 'host' && callerRole !== 'dealer') {
        return fail('딜러 또는 방장만 승인할 수 있습니다')
      }

      // 락 이후 상태 재조회 — 다른 딜러가 먼저 처리했을 수 있다.
      const [fresh] = await tx
        .select()
        .from(betActions)
        .where(eq(betActions.id, target.id))
        .limit(1)
      if (!fresh || fresh.status !== 'pending') return fail('이미 처리된 액션입니다')

      const [round] = await tx
        .select({ status: rounds.status })
        .from(rounds)
        .where(eq(rounds.id, fresh.roundId))
        .limit(1)
      if (round?.status !== 'playing') return fail('판이 이미 끝났습니다')

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
            : fail('처리에 실패했습니다')
        }
      }

      const [updated] = await tx
        .update(betActions)
        .set({ status: 'accepted', approvedBy: callerId })
        .where(eq(betActions.id, fresh.id))
        .returning()
      if (!updated) return fail('승인에 실패했습니다')

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
    return fail('승인에 실패했습니다')
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
  if (!callerId) return fail('로그인이 필요합니다')

  const parsed = rejectSchema.safeParse(input)
  if (!parsed.success) return fail('거절 사유를 입력하세요')

  try {
    return await db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(betActions)
        .where(eq(betActions.id, parsed.data.actionId))
        .limit(1)
      if (!target) return fail('액션을 찾을 수 없습니다')

      await lockRoom(tx, target.roomId)

      const callerRole = await memberRole(tx, target.roomId, callerId)
      if (callerRole !== 'host' && callerRole !== 'dealer') {
        return fail('딜러 또는 방장만 거절할 수 있습니다')
      }

      const [updated] = await tx
        .update(betActions)
        .set({ status: 'rejected', approvedBy: callerId, reason: parsed.data.reason })
        .where(and(eq(betActions.id, target.id), eq(betActions.status, 'pending')))
        .returning()
      if (!updated) return fail('이미 처리된 액션입니다')

      return ok({ action: toView(updated) })
    })
  } catch (error) {
    console.error('rejectBet failed:', error)
    return fail('거절에 실패했습니다')
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
  if (!callerId) return fail('로그인이 필요합니다')

  const parsed = revertSchema.safeParse(input)
  if (!parsed.success) return fail('정정 사유를 입력하세요')

  try {
    return await db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(betActions)
        .where(eq(betActions.id, parsed.data.actionId))
        .limit(1)
      if (!target) return fail('액션을 찾을 수 없습니다')

      await lockRoom(tx, target.roomId)

      const callerRole = await memberRole(tx, target.roomId, callerId)
      if (callerRole !== 'host' && callerRole !== 'dealer') {
        return fail('딜러 또는 방장만 정정할 수 있습니다')
      }

      const [round] = await tx
        .select({ status: rounds.status })
        .from(rounds)
        .where(eq(rounds.id, target.roundId))
        .limit(1)
      if (round?.status !== 'playing') {
        return fail('끝난 판은 정정할 수 없습니다. 판 무효화를 사용하세요')
      }

      const [updated] = await tx
        .update(betActions)
        .set({ status: 'reverted', reason: parsed.data.reason })
        .where(and(eq(betActions.id, target.id), eq(betActions.status, 'accepted')))
        .returning()
      if (!updated) return fail('확정된 액션만 정정할 수 있습니다')

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
    return fail('정정에 실패했습니다')
  }
}
