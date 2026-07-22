'use server'

import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { db, schema } from '@/lib/db'
import { currentUserId } from '../auth/session'

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
