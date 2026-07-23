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
  if (!callerId) return fail('로그인이 필요합니다')

  const parsed = addBuyInSchema.safeParse(input)
  if (!parsed.success) return fail('입력값이 올바르지 않습니다')
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
      if (!caller) return fail('이 방의 참가자가 아닙니다')

      const isDealer = caller.role === 'host' || caller.role === 'dealer'
      if (userId !== callerId && !isDealer) return fail('다른 사람 바이인은 딜러만 추가할 수 있습니다')

      if (userId !== callerId) {
        const [target] = await tx
          .select({ userId: roomMembers.userId })
          .from(roomMembers)
          .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)))
          .limit(1)
        if (!target) return fail('대상이 방 참가자가 아닙니다')
      }

      const [room] = await tx
        .select({ status: rooms.status })
        .from(rooms)
        .where(eq(rooms.id, roomId))
        .limit(1)
      if (!room) return fail('방을 찾을 수 없습니다')
      if (room.status === 'settled' || room.status === 'closed') return fail('이미 끝난 방입니다')

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
    return fail('바이인 추가에 실패했습니다')
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
  if (!callerId) return fail('로그인이 필요합니다')

  const parsed = undoLastBuyInSchema.safeParse(input)
  if (!parsed.success) return fail('입력값이 올바르지 않습니다')
  const { roomId, targetUserId } = parsed.data

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)
      if (!(await requireRole(tx, roomId, callerId, ['host', 'dealer']))) {
        return fail('딜러 또는 방장만 지급을 취소할 수 있습니다')
      }

      const [room] = await tx
        .select({ status: rooms.status })
        .from(rooms)
        .where(eq(rooms.id, roomId))
        .limit(1)
      if (!room) return fail('방을 찾을 수 없습니다')
      if (room.status === 'settled' || room.status === 'closed') return fail('이미 끝난 방입니다')

      const [target] = await tx
        .select({ userId: roomMembers.userId })
        .from(roomMembers)
        .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, targetUserId)))
        .limit(1)
      if (!target) return fail('대상이 방 참가자가 아닙니다')

      // 최신 행이 음수(이미 취소분)면 되돌릴 지급이 없다 — 연쇄 취소 방지.
      const [lastBuyIn] = await tx
        .select({ amount: buyIns.amount })
        .from(buyIns)
        .where(and(eq(buyIns.roomId, roomId), eq(buyIns.userId, targetUserId)))
        .orderBy(desc(buyIns.createdAt))
        .limit(1)
      if (!lastBuyIn || lastBuyIn.amount <= 0) return fail('취소할 바이인이 없습니다')

      const balance = await balanceInRoom(tx, roomId, targetUserId)
      if (balance < lastBuyIn.amount) {
        return fail('이미 사용한 칩이라 지급 취소가 불가합니다 — 정정 베팅으로 조정하세요')
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
    return fail('지급 취소에 실패했습니다')
  }
}
