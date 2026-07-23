'use server'

import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { db, schema } from '@/lib/db'
import { currentUserId } from '../auth/session'
import { balanceInRoom, lockRoom, requireRole, type Tx } from './action-helpers'

/** 멤버 역할 액션 — 방장 위임·역할 변경·내보내기·나가기. */

const { rooms, roomMembers, rounds, betActions, chipLedger, buyIns } = schema

const transferHostSchema = z.object({
  roomId: z.string().uuid(),
  targetUserId: z.string().uuid(),
})

/** 방장 위임 — 현재 방장은 player 로 내려가고 대상이 host 가 된다. */
export async function transferHost(
  input: z.infer<typeof transferHostSchema>,
): Promise<ActionResult<{ newHostId: string }>> {
  const userId = await currentUserId()
  if (!userId) return fail('로그인이 필요합니다')

  const parsed = transferHostSchema.safeParse(input)
  if (!parsed.success) return fail('입력값이 올바르지 않습니다')
  const { roomId, targetUserId } = parsed.data
  if (targetUserId === userId) return fail('자기 자신에게는 위임할 수 없습니다')

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)
      if (!(await requireRole(tx, roomId, userId, ['host']))) {
        return fail('방장만 위임할 수 있습니다')
      }

      const [target] = await tx
        .select({ role: roomMembers.role, leftAt: roomMembers.leftAt })
        .from(roomMembers)
        .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, targetUserId)))
        .limit(1)
      if (!target || target.leftAt) return fail('대상이 방 참가자가 아닙니다')

      await tx
        .update(roomMembers)
        .set({ role: 'player' })
        .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)))
      await tx
        .update(roomMembers)
        .set({ role: 'host' })
        .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, targetUserId)))
      await tx.update(rooms).set({ hostId: targetUserId }).where(eq(rooms.id, roomId))

      return ok({ newHostId: targetUserId })
    })
  } catch (error) {
    console.error('transferHost failed:', error)
    return fail('방장 위임에 실패했습니다')
  }
}

const setRoleSchema = z.object({
  roomId: z.string().uuid(),
  targetUserId: z.string().uuid(),
  role: z.enum(['dealer', 'player', 'observer']),
})

/** 딜러 재위임 등 역할 변경. host 역할 자체는 이 경로로 바꿀 수 없다. */
export async function setMemberRole(
  input: z.infer<typeof setRoleSchema>,
): Promise<ActionResult<{ targetUserId: string; role: string }>> {
  const userId = await currentUserId()
  if (!userId) return fail('로그인이 필요합니다')

  const parsed = setRoleSchema.safeParse(input)
  if (!parsed.success) return fail('입력값이 올바르지 않습니다')
  const { roomId, targetUserId, role } = parsed.data

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)
      if (!(await requireRole(tx, roomId, userId, ['host']))) {
        return fail('방장만 역할을 바꿀 수 있습니다')
      }

      const [target] = await tx
        .select({ role: roomMembers.role })
        .from(roomMembers)
        .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, targetUserId)))
        .limit(1)
      if (!target) return fail('대상이 방 참가자가 아닙니다')
      if (target.role === 'host') return fail('방장 역할은 바꿀 수 없습니다')

      await tx
        .update(roomMembers)
        .set({ role })
        .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, targetUserId)))

      return ok({ targetUserId, role })
    })
  } catch (error) {
    console.error('setMemberRole failed:', error)
    return fail('역할 변경에 실패했습니다')
  }
}

/** 이번 판(진행 중)에 확정 베팅이 있으면 퇴장할 수 없다 — 팟 정합성이 깨진다. */
async function hasAcceptedBetInPlayingRound(
  tx: Tx,
  roomId: string,
  userId: string,
): Promise<boolean> {
  const [playing] = await tx
    .select({ id: rounds.id })
    .from(rounds)
    .where(and(eq(rounds.roomId, roomId), eq(rounds.status, 'playing')))
    .limit(1)
  if (!playing) return false

  const [bet] = await tx
    .select({ id: betActions.id })
    .from(betActions)
    .where(
      and(
        eq(betActions.roundId, playing.id),
        eq(betActions.userId, userId),
        eq(betActions.status, 'accepted'),
      ),
    )
    .limit(1)
  return Boolean(bet)
}

/**
 * 퇴장 공통 처리 — leftAt 을 기록하고, 잔액은 correction(-balance)·바이인 총액은
 * 음수 buy_ins(-buyInTotal) 상쇄 행으로 0 으로 맞춘다. 원본 행은 고치지 않는다 (append-only).
 * buy_ins.amount 에는 양수 제약이 없어 음수 상쇄 행이 유효하다.
 * 이렇게 하면 나간 멤버는 모든 집계(세션 순위·누적 랭킹)에 net 0 으로 잡혀,
 * 활동 멤버만 세는 화면과 전체를 세는 화면이 서로 일관된다. 남은 멤버들의 net 합에
 * 나간 멤버의 손익이 반대 부호로 남는 것은 실제 칩 이동의 결과라 의도된 동작이다.
 */
async function retireMember(
  tx: Tx,
  roomId: string,
  targetUserId: string,
  callerId: string,
): Promise<void> {
  const balance = await balanceInRoom(tx, roomId, targetUserId)
  const [buyInRow] = await tx
    .select({ total: sql<number>`coalesce(sum(${buyIns.amount}), 0)::int` })
    .from(buyIns)
    .where(and(eq(buyIns.roomId, roomId), eq(buyIns.userId, targetUserId)))
  const buyInTotal = buyInRow?.total ?? 0

  await tx
    .update(roomMembers)
    .set({ leftAt: new Date() })
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, targetUserId)))

  if (balance !== 0) {
    await tx.insert(chipLedger).values({
      roomId,
      userId: targetUserId,
      delta: -balance,
      reason: 'correction',
    })
  }
  if (buyInTotal !== 0) {
    await tx
      .insert(buyIns)
      .values({ roomId, userId: targetUserId, amount: -buyInTotal, createdBy: callerId })
  }
}

const removeMemberSchema = z.object({
  roomId: z.string().uuid(),
  targetUserId: z.string().uuid(),
})

/** 멤버 내보내기 — 방장·딜러 전용. 방장은 내보낼 수 없다. */
export async function removeMember(
  input: z.infer<typeof removeMemberSchema>,
): Promise<ActionResult<{ targetUserId: string }>> {
  const userId = await currentUserId()
  if (!userId) return fail('로그인이 필요합니다')

  const parsed = removeMemberSchema.safeParse(input)
  if (!parsed.success) return fail('입력값이 올바르지 않습니다')
  const { roomId, targetUserId } = parsed.data
  if (targetUserId === userId) return fail('자기 자신은 내보낼 수 없습니다 — 나가기를 사용하세요')

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)
      if (!(await requireRole(tx, roomId, userId, ['host', 'dealer']))) {
        return fail('딜러 또는 방장만 내보낼 수 있습니다')
      }

      const [room] = await tx
        .select({ status: rooms.status })
        .from(rooms)
        .where(eq(rooms.id, roomId))
        .limit(1)
      if (!room) return fail('방을 찾을 수 없습니다')
      if (room.status === 'settled' || room.status === 'closed') return fail('이미 끝난 방입니다')

      const [target] = await tx
        .select({ role: roomMembers.role, leftAt: roomMembers.leftAt })
        .from(roomMembers)
        .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, targetUserId)))
        .limit(1)
      if (!target) return fail('대상이 방 참가자가 아닙니다')
      if (target.leftAt) return fail('이미 나간 참가자입니다')
      if (target.role === 'host') return fail('방장은 내보낼 수 없습니다')

      if (await hasAcceptedBetInPlayingRound(tx, roomId, targetUserId)) {
        return fail('이번 판에 확정된 베팅이 있어 내보낼 수 없습니다 — 판이 끝날 때까지는 관전자 전환을 사용하세요')
      }

      await retireMember(tx, roomId, targetUserId, userId)
      return ok({ targetUserId })
    })
  } catch (error) {
    console.error('removeMember failed:', error)
    return fail('내보내기에 실패했습니다')
  }
}

const leaveRoomSchema = z.object({ roomId: z.string().uuid() })

/** 방 나가기 — 본인 전용. 방장은 위임 후에만 나갈 수 있다. */
export async function leaveRoom(
  input: z.infer<typeof leaveRoomSchema>,
): Promise<ActionResult<{ roomId: string }>> {
  const userId = await currentUserId()
  if (!userId) return fail('로그인이 필요합니다')

  const parsed = leaveRoomSchema.safeParse(input)
  if (!parsed.success) return fail('입력값이 올바르지 않습니다')
  const { roomId } = parsed.data

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)

      const [me] = await tx
        .select({ role: roomMembers.role, leftAt: roomMembers.leftAt })
        .from(roomMembers)
        .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)))
        .limit(1)
      if (!me) return fail('이 방의 참가자가 아닙니다')
      if (me.leftAt) return ok({ roomId }) // 이미 나감 — 멱등
      if (me.role === 'host') return fail('방장은 방장 위임 후에 나갈 수 있습니다')

      const [room] = await tx
        .select({ status: rooms.status })
        .from(rooms)
        .where(eq(rooms.id, roomId))
        .limit(1)
      if (!room) return fail('방을 찾을 수 없습니다')
      if (room.status === 'settled' || room.status === 'closed') return fail('이미 끝난 방입니다')

      if (await hasAcceptedBetInPlayingRound(tx, roomId, userId)) {
        return fail('이번 판에 확정된 베팅이 있어 나갈 수 없습니다 — 판이 끝난 뒤 나가거나 관전자로 전환하세요')
      }

      await retireMember(tx, roomId, userId, userId)
      return ok({ roomId })
    })
  } catch (error) {
    console.error('leaveRoom failed:', error)
    return fail('나가기에 실패했습니다')
  }
}
