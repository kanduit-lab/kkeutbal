'use server'

import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { db, schema } from '@/lib/db'
import { consumeRateLimitsUnlessAdmin } from '@/lib/rate-limit'
import { currentUserId } from '../auth/session'
import { balanceInRoom, lockRoom, requireRole } from '../game/action-helpers'
import { isInsufficientCreditError } from '../game/credit-rpc'
import { readFundingMode } from '../game/funding-mode'

const { rooms, roomMembers, buyIns, chipLedger, roomCreditLocks } = schema

const addBuyInSchema = z.object({
  // 재전송 흡수용 요청 id. 클라이언트가 초안(대상·금액)마다 하나씩 만들고 확정되면 버린다.
  // `adminAdjustCredits`의 `requestId`와 역할이 같지만 저장 위치가 다르다 — 저쪽은
  // `credit_transactions.idempotency_key`에 흡수되고, 이쪽은 session 재원 방(크레딧 거래가
  // 아예 없는 경로)까지 덮어야 해서 `buy_ins.id`를 그대로 키로 쓴다.
  requestId: z.string().uuid(),
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
  const { requestId, roomId, amount } = parsed.data
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

      // 요청 id를 그대로 `buy_ins.id`로 쓴다. 세션 원장(`chip_ledger.ref_buy_in_id`)도,
      // 지갑 잠금(`room_credit_locks.buy_in_id`와 `room-credit-lock:v1:{buy_in_id}` 키)도
      // 전부 이 id 하나에 매달려 있으므로, PK 충돌 한 번이 세 벌의 중복을 동시에 막는다.
      // 방 advisory lock을 이미 잡고 있어서 같은 키의 동시 요청도 여기서 직렬화된다.
      const [inserted] = await tx
        .insert(buyIns)
        .values({ id: requestId, roomId, userId, amount, createdBy: callerId })
        .onConflictDoNothing({ target: buyIns.id })
        .returning({ id: buyIns.id })

      if (!inserted) {
        // `admin_adjust_credit`과 같은 **의미 비교**를 한다 — 같은 키라도 뜻이 다르면
        // 흡수하지 않는다. 방·대상·금액·기록자가 전부 같고 되돌리기 행이 아닐 때만
        // "이미 확정한 그 요청"으로 인정하고 같은 결과를 돌려준다.
        const [existing] = await tx
          .select({
            roomId: buyIns.roomId,
            userId: buyIns.userId,
            amount: buyIns.amount,
            createdBy: buyIns.createdBy,
            revertedOf: buyIns.revertedOf,
          })
          .from(buyIns)
          .where(eq(buyIns.id, requestId))
          .limit(1)
        const sameRequest =
          existing !== undefined &&
          existing.roomId === roomId &&
          existing.userId === userId &&
          existing.amount === amount &&
          existing.createdBy === callerId &&
          existing.revertedOf === null
        if (!sameRequest) return fail('errors.buyInRequestReused')
        return ok({ userId, amount, balance: await balanceInRoom(tx, roomId, userId) })
      }

      await tx
        .insert(chipLedger)
        .values({ roomId, userId, delta: amount, reason: 'buy_in', refBuyInId: inserted.id })

      if (readFundingMode(room.rulePreset) === 'account_credit') {
        await tx.execute(sql`
          select public.lock_room_credit_buy_in(
            ${roomId}::uuid,
            ${userId}::uuid,
            ${inserted.id}::uuid,
            ${amount}::bigint,
            ${callerId}::uuid
          )
        `)
      }

      return ok({ userId, amount, balance: await balanceInRoom(tx, roomId, userId) })
    })
  } catch (error) {
    // 계정 크레딧 방의 추가 바이인은 대상자의 available 크레딧을 잠근다. 모자라면 DB가
    // 거절하는데, 딜러 화면에는 "바이인 추가에 실패했습니다"만 떠서 대상자가 크레딧을
    // 채워야 한다는 것을 알 수 없었다.
    if (isInsufficientCreditError(error)) return fail('errors.insufficientCredit')
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

      const fundingMode = readFundingMode(room.rulePreset)
      if (fundingMode === 'account_credit' && balance - lastBuyIn.amount !== 0) {
        // 취소하면 이 바이인의 전역 잠금이 풀린다. 그런데 칩이 남는데 이 방에 다른 활성
        // 잠금이 없으면, `settle_room_credits`가 active lock을 기준으로 세션 잔액을
        // 조인하는 탓에 그 사람은 정산의 양쪽에서 통째로 빠지고 보존식 검사가 예외를
        // 던진다 — 방장도 관리자도 방을 닫을 수 없고 **다른 참가자의 크레딧까지 영구히
        // 잠긴다**. 잔액만 보는 위 검사는 이 상황을 통과시킨다(1000 취소 시 1500 >= 1000).
        //
        // 사용자별 `칩 == 잠금액`을 요구하지는 않는다는 점이 중요하다 — 판이 오가면 이긴
        // 쪽은 칩 > 잠금이 정상이고, 잠금이 하나라도 남으면 정산 조인에 계속 들어온다.
        // 권위 있는 같은 검사는 `release_room_credit_buy_in`에 있다(0018). 여기 검사는
        // 거절 이유를 사용자에게 보여주기 위한 앞단이다.
        const [otherLock] = await tx
          .select({ id: roomCreditLocks.id })
          .from(roomCreditLocks)
          .where(
            and(
              eq(roomCreditLocks.roomId, roomId),
              eq(roomCreditLocks.userId, targetUserId),
              isNull(roomCreditLocks.releasedTransactionId),
              ne(roomCreditLocks.buyInId, lastBuyIn.id),
            ),
          )
          .limit(1)
        if (!otherLock) return fail('errors.undoBuyInWouldStrandCredits')
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

      if (fundingMode === 'account_credit') {
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