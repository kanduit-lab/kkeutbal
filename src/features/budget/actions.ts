'use server'

import { and, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { db, schema } from '@/lib/db'
import { currentUserId } from '../auth/session'
import { balanceInRoom, lockRoom, requireRole } from '../game/action-helpers'

const { rooms, roomMembers, buyIns, chipLedger } = schema

const addBuyInSchema = z.object({
  roomId: z.string().uuid(),
  amount: z.number().int().min(1).max(10_000_000),
  /** 생략하면 본인 추가 바이인. 지정은 딜러/방장만. */
  targetUserId: z.string().uuid().optional(),
})

export async function addBuyIn(
  input: z.infer<typeof addBuyInSchema>,
): Promise<ActionResult<{ userId: string; amount: number; balance: number }>> {
  const callerId = await currentUserId()
  if (!callerId) return fail('errors.loginRequired')

  const parsed = addBuyInSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')
  const { roomId, amount } = parsed.data
  const userId = parsed.data.targetUserId ?? callerId

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${roomId}, 42))`)

      const [caller] = await tx
        .select({ role: roomMembers.role })
        .from(roomMembers)
        .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, callerId)))
        .limit(1)
      if (!caller) return fail('errors.notMember')

      const isDealer = caller.role === 'host' || caller.role === 'dealer'
      if (userId !== callerId && !isDealer) return fail('errors.proxyBuyInDealerOnly')

      if (userId !== callerId) {
        const [target] = await tx
          .select({ userId: roomMembers.userId })
          .from(roomMembers)
          .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)))
          .limit(1)
        if (!target) return fail('errors.targetNotMember')
      }

      const [room] = await tx
        .select({ status: rooms.status })
        .from(rooms)
        .where(eq(rooms.id, roomId))
        .limit(1)
      if (!room) return fail('errors.roomNotFound')
      if (room.status === 'settled' || room.status === 'closed') return fail('errors.roomEnded')

      await tx.insert(buyIns).values({ roomId, userId, amount, createdBy: callerId })
      await tx.insert(chipLedger).values({ roomId, userId, delta: amount, reason: 'buy_in' })

      const [balanceRow] = await tx
        .select({ balance: sql<number>`coalesce(sum(${chipLedger.delta}), 0)::int` })
        .from(chipLedger)
        .where(and(eq(chipLedger.roomId, roomId), eq(chipLedger.userId, userId)))

      return ok({ userId, amount, balance: balanceRow?.balance ?? 0 })
    })
  } catch (error) {
    console.error('addBuyIn failed:', error)
    return fail('errors.addBuyInFailed')
  }
}

const undoLastBuyInSchema = z.object({
  roomId: z.string().uuid(),
  targetUserId: z.string().uuid(),
})

/**
 * 마지막 바이인 지급 취소 — 딜러/방장 전용. 오지급 즉시 회수 용도.
 * 원본 행은 고치지 않고 음수 buy_ins + correction 상쇄 행을 쌓는다 (append-only).
 */
export async function undoLastBuyIn(
  input: z.infer<typeof undoLastBuyInSchema>,
): Promise<ActionResult<{ userId: string; amount: number }>> {
  const callerId = await currentUserId()
  if (!callerId) return fail('errors.loginRequired')

  const parsed = undoLastBuyInSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')
  const { roomId, targetUserId } = parsed.data

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)
      if (!(await requireRole(tx, roomId, callerId, ['host', 'dealer']))) {
        return fail('errors.dealerOrHostOnlyUndoBuyIn')
      }

      const [room] = await tx
        .select({ status: rooms.status })
        .from(rooms)
        .where(eq(rooms.id, roomId))
        .limit(1)
      if (!room) return fail('errors.roomNotFound')
      if (room.status === 'settled' || room.status === 'closed') return fail('errors.roomEnded')

      const [target] = await tx
        .select({ userId: roomMembers.userId })
        .from(roomMembers)
        .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, targetUserId)))
        .limit(1)
      if (!target) return fail('errors.targetNotMember')

      // 최신 행이 음수(이미 취소분)면 되돌릴 지급이 없다 — 연쇄 취소 방지.
      const [lastBuyIn] = await tx
        .select({ amount: buyIns.amount })
        .from(buyIns)
        .where(and(eq(buyIns.roomId, roomId), eq(buyIns.userId, targetUserId)))
        .orderBy(desc(buyIns.createdAt))
        .limit(1)
      if (!lastBuyIn || lastBuyIn.amount <= 0) return fail('errors.nothingToUndoBuyIn')

      const balance = await balanceInRoom(tx, roomId, targetUserId)
      if (balance < lastBuyIn.amount) {
        return fail('errors.buyInAlreadySpent')
      }

      // buy_ins 와 chip_ledger 는 FK 로 연결되지 않는다 — 같은 금액의 최신 buy_in
      // 원장 행을 원본으로 추정해 revertedOf 로 가리킨다 (없으면 null).
      const [originalLedger] = await tx
        .select({ id: chipLedger.id })
        .from(chipLedger)
        .where(
          and(
            eq(chipLedger.roomId, roomId),
            eq(chipLedger.userId, targetUserId),
            eq(chipLedger.reason, 'buy_in'),
            eq(chipLedger.delta, lastBuyIn.amount),
          ),
        )
        .orderBy(desc(chipLedger.createdAt))
        .limit(1)

      await tx
        .insert(buyIns)
        .values({ roomId, userId: targetUserId, amount: -lastBuyIn.amount, createdBy: callerId })
      await tx.insert(chipLedger).values({
        roomId,
        userId: targetUserId,
        delta: -lastBuyIn.amount,
        reason: 'correction',
        revertedOf: originalLedger?.id ?? null,
      })

      return ok({ userId: targetUserId, amount: lastBuyIn.amount })
    })
  } catch (error) {
    console.error('undoLastBuyIn failed:', error)
    return fail('errors.undoBuyInFailed')
  }
}
