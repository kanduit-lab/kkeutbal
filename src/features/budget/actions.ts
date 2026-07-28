'use server'

import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { db, schema } from '@/lib/db'
import { currentUserId } from '../auth/session'
import { balanceInRoom, lockRoom, requireRole } from '../game/action-helpers'
import { readFundingMode } from '../game/funding-mode'
import { toSafeChipInteger } from '../game/chip-integers'

const { rooms, roomMembers, buyIns, chipLedger } = schema

const addBuyInSchema = z.object({
  roomId: z.string().uuid(),
  amount: z.number().int().min(1).max(10_000_000),
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
        .where(
          and(
            eq(roomMembers.roomId, roomId),
            eq(roomMembers.userId, callerId),
            isNull(roomMembers.leftAt),
          ),
        )
        .limit(1)
      if (!caller) return fail('errors.notMember')

      const isDealer = caller.role === 'host' || caller.role === 'dealer'
      if (userId !== callerId && !isDealer) return fail('errors.proxyBuyInDealerOnly')

      const [target] = await tx
        .select({ userId: roomMembers.userId, role: roomMembers.role })
        .from(roomMembers)
        .where(
          and(
            eq(roomMembers.roomId, roomId),
            eq(roomMembers.userId, userId),
            isNull(roomMembers.leftAt),
          ),
        )
        .limit(1)
      if (!target) return fail('errors.targetNotMember')
      if (target.role === 'observer') return fail('errors.observerCannotBuyIn')

      const [room] = await tx
        .select({ status: rooms.status, rulePreset: rooms.rulePreset })
        .from(rooms)
        .where(eq(rooms.id, roomId))
        .limit(1)
      if (!room) return fail('errors.roomNotFound')
      if (room.status === 'settled' || room.status === 'closed') return fail('errors.roomEnded')

      const [buyIn] = await tx
        .insert(buyIns)
        .values({ roomId, userId, amount, createdBy: callerId })
        .returning({ id: buyIns.id })
      if (!buyIn) return fail('errors.addBuyInFailed')
      await tx
        .insert(chipLedger)
        .values({ roomId, userId, delta: amount, reason: 'buy_in', refBuyInId: buyIn.id })

      if (readFundingMode(room.rulePreset) === 'account_credit') {
        await tx.execute(sql`
          select public.lock_room_credit_buy_in(
            ${roomId}::uuid,
            ${userId}::uuid,
            ${buyIn.id}::uuid,
            ${amount}::bigint,
            ${callerId}::uuid
          )
        `)
      }

      const [balanceRow] = await tx
        .select({ balance: sql<string>`coalesce(sum(${chipLedger.delta}), 0)::text` })
        .from(chipLedger)
        .where(and(eq(chipLedger.roomId, roomId), eq(chipLedger.userId, userId)))

      return ok({
        userId,
        amount,
        balance: toSafeChipInteger(balanceRow?.balance ?? '0', 'Buy-in room balance'),
      })
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
        .select({ status: rooms.status, rulePreset: rooms.rulePreset })
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

      const [lastBuyIn] = await tx
        .select({ id: buyIns.id, amount: buyIns.amount })
        .from(buyIns)
        .where(and(eq(buyIns.roomId, roomId), eq(buyIns.userId, targetUserId)))
        .orderBy(desc(buyIns.createdAt))
        .limit(1)
      if (!lastBuyIn || lastBuyIn.amount <= 0) return fail('errors.nothingToUndoBuyIn')

      const balance = await balanceInRoom(tx, roomId, targetUserId)
      if (balance < lastBuyIn.amount) {
        return fail('errors.buyInAlreadySpent')
      }

      const [originalLedger] = await tx
        .select({ id: chipLedger.id })
        .from(chipLedger)
        .where(
          and(
            eq(chipLedger.roomId, roomId),
            eq(chipLedger.userId, targetUserId),
            eq(chipLedger.reason, 'buy_in'),
            eq(chipLedger.delta, lastBuyIn.amount),
            sql`(${chipLedger.refBuyInId} = ${lastBuyIn.id} or ${chipLedger.refBuyInId} is null)`,
          ),
        )
        .orderBy(sql`${chipLedger.refBuyInId} is not null desc`, desc(chipLedger.createdAt))
        .limit(1)

      const [reversal] = await tx
        .insert(buyIns)
        .values({
          roomId,
          userId: targetUserId,
          amount: -lastBuyIn.amount,
          createdBy: callerId,
          revertedOf: lastBuyIn.id,
        })
        .returning({ id: buyIns.id })
      if (!reversal) throw new Error('buy-in reversal insert failed')
      await tx.insert(chipLedger).values({
        roomId,
        userId: targetUserId,
        delta: -lastBuyIn.amount,
        reason: 'correction',
        refBuyInId: reversal.id,
        revertedOf: originalLedger?.id ?? null,
      })

      if (readFundingMode(room.rulePreset) === 'account_credit') {
        await tx.execute(sql`
          select public.release_room_credit_buy_in(
            ${roomId}::uuid,
            ${targetUserId}::uuid,
            ${lastBuyIn.id}::uuid,
            ${reversal.id}::uuid,
            ${lastBuyIn.amount}::bigint,
            ${callerId}::uuid
          )
        `)
      }

      return ok({ userId: targetUserId, amount: lastBuyIn.amount })
    })
  } catch (error) {
    console.error('undoLastBuyIn failed:', error)
    return fail('errors.undoBuyInFailed')
  }
}