'use server'

import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { db, schema } from '@/lib/db'
import { consumeRateLimitsUnlessAdmin } from '@/lib/rate-limit'
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

  // 한도는 호출자(딜러 대리 입력 포함) 기준. 정상 사용 최악 케이스: 딜러가 여러 참가자의
  // 칩을 한꺼번에 top-up하는 짧은 버스트(분당 10회)와, 긴 세션 동안 반복되는 재입금
  // 누적(시간당 60회 — 10인방 전원이 각각 여러 번 추가 바이인을 해도 여유가 있다).
  // 면제 판정은 대상자(`userId`)가 아니라 **호출자** 기준이다 — 대리 입력에서 대상자가
  // 관리자라는 이유로 면제되면 안 된다.
  const rate = await consumeRateLimitsUnlessAdmin(callerId, [
    {
      scope: 'game.add_buy_in.user.minute',
      identifier: callerId,
      limit: 10,
      windowMs: 60 * 1000,
    },
    {
      scope: 'game.add_buy_in.user.hour',
      identifier: callerId,
      limit: 60,
      windowMs: 60 * 60 * 1000,
    },
  ])
  if (!rate.allowed) return fail('errors.addBuyInRateLimited')

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

      // 바이인은 방 안에서 칩을 새로 발행하는 유일한 경로다. 딜러·방장만 할 수 있다.
      //
      // 예전 조건은 `userId !== callerId && !isDealer`라서 **대리 지급일 때만** 역할을 봤다.
      // 즉 평범한 참가자가 `targetUserId` 없이 자기 자신에게 바이인을 요청하면 그대로
      // 통과했다. UI는 이 버튼을 딜러에게만 보여주므로 화면으로는 닿을 수 없었지만,
      // Server Action을 직접 부르면 한 번에 1000만 칩까지 스스로 찍어낼 수 있었다.
      // session 재원 방에는 이걸 막아줄 뒷단이 아무것도 없다.
      const isDealer = caller.role === 'host' || caller.role === 'dealer'
      if (!isDealer) {
        return fail(userId !== callerId ? 'errors.proxyBuyInDealerOnly' : 'errors.buyInDealerOnly')
      }

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

      // 레거시 폴백(`refBuyInId = lastBuyIn.id OR refBuyInId IS NULL`)은 제거했다 — 같은
      // 사용자·같은 금액의 refBuyInId-null 원장 행이 여러 개 있으면 정렬 보정이 있어도
      // 실제 되돌리려는 바이인과 무관한 행을 revertedOf로 연결할 수 있었다(레거시 백필
      // 범위 — `0009_perfect_molly_hayes.sql`). 이제 refBuyInId가 정확히 일치하는 원장 행만 찾고,
      // 없으면 조용히 넘어가거나 revertedOf를 null로 두지 않고 되돌리기 자체를 거부한다 —
      // 칩은 맞는데 감사 사슬만 어긋나는 상태가 되돌리기 실패보다 나쁘다.
      const [originalLedger] = await tx
        .select({ id: chipLedger.id })
        .from(chipLedger)
        .where(
          and(
            eq(chipLedger.roomId, roomId),
            eq(chipLedger.userId, targetUserId),
            eq(chipLedger.reason, 'buy_in'),
            eq(chipLedger.delta, lastBuyIn.amount),
            eq(chipLedger.refBuyInId, lastBuyIn.id),
          ),
        )
        .limit(1)
      if (!originalLedger) return fail('errors.undoBuyInLedgerMismatch')

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
        revertedOf: originalLedger.id,
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