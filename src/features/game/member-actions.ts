'use server'

import { randomUUID } from 'node:crypto'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { db, schema } from '@/lib/db'
import { consumeRateLimitsUnlessAdmin } from '@/lib/rate-limit'
import { currentUserId } from '../auth/session'
import { lockRoom, readMaxMembers, requireRole, type Tx } from './action-helpers'
import { readFundingMode } from './funding-mode'

const { rooms, roomMembers, rounds, roundParticipants, users, buyIns, chipLedger } = schema

async function isActiveRoundParticipant(tx: Tx, roomId: string, userId: string): Promise<boolean> {
  const [participant] = await tx
    .select({ roundId: roundParticipants.roundId })
    .from(roundParticipants)
    .innerJoin(rounds, eq(rounds.id, roundParticipants.roundId))
    .where(
      and(
        eq(rounds.roomId, roomId),
        eq(rounds.status, 'playing'),
        eq(roundParticipants.userId, userId),
      ),
    )
    .limit(1)
  return Boolean(participant)
}

const transferHostSchema = z.object({
  roomId: z.string().uuid(),
  targetUserId: z.string().uuid(),
})

export async function transferHost(
  input: z.infer<typeof transferHostSchema>,
): Promise<ActionResult<{ newHostId: string }>> {
  const userId = await currentUserId()
  if (!userId) return fail('errors.loginRequired')

  const parsed = transferHostSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')
  const { roomId, targetUserId } = parsed.data
  if (targetUserId === userId) return fail('errors.cannotTransferSelf')

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)
      if (!(await requireRole(tx, roomId, userId, ['host']))) {
        return fail('errors.hostOnlyTransfer')
      }

      const [target] = await tx
        .select({
          role: roomMembers.role,
          leftAt: roomMembers.leftAt,
          isManaged: users.isManaged,
        })
        .from(roomMembers)
        .innerJoin(users, eq(users.id, roomMembers.userId))
        .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, targetUserId)))
        .limit(1)
      if (!target || target.leftAt) return fail('errors.targetNotMember')
      if (target.role === 'observer') return fail('errors.observerCannotBecomeHost')
      // 대리 참가자(로컬 멤버)는 로그인할 수 있는 계정이 아니다 — 방장 자리를 넘기면
      // 방장 전용 액션(정산·설정·방장 위임·역할 변경)에 아무도 닿을 수 없게 되고,
      // 관리자 강제 정산 말고는 방을 되살릴 방법이 없다.
      if (target.isManaged) return fail('errors.managedCannotBecomeHost')

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
    return fail('errors.transferHostFailed')
  }
}

const setRoleSchema = z.object({
  roomId: z.string().uuid(),
  targetUserId: z.string().uuid(),
  role: z.enum(['dealer', 'player', 'observer']),
})

export async function setMemberRole(
  input: z.infer<typeof setRoleSchema>,
): Promise<ActionResult<{ targetUserId: string; role: string }>> {
  const userId = await currentUserId()
  if (!userId) return fail('errors.loginRequired')

  const parsed = setRoleSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')
  const { roomId, targetUserId, role } = parsed.data

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)
      if (!(await requireRole(tx, roomId, userId, ['host']))) {
        return fail('errors.hostOnlyRole')
      }

      const [target] = await tx
        .select({
          role: roomMembers.role,
          leftAt: roomMembers.leftAt,
        })
        .from(roomMembers)
        .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, targetUserId)))
        .limit(1)
      if (!target || target.leftAt) return fail('errors.targetNotMember')
      if (target.role === 'host') return fail('errors.cannotChangeHostRole')

      if (target.role === 'observer' || role === 'observer') {
        const [participating] = await tx
          .select({ id: rounds.id })
          .from(rounds)
          .innerJoin(roundParticipants, eq(roundParticipants.roundId, rounds.id))
          .where(
            and(
              eq(rounds.roomId, roomId),
              eq(rounds.status, 'playing'),
              eq(roundParticipants.userId, targetUserId),
            ),
          )
          .limit(1)
        if (participating) return fail('errors.cannotChangeParticipationDuringRound')
      }

      await tx
        .update(roomMembers)
        .set({ role })
        .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, targetUserId)))

      return ok({ targetUserId, role })
    })
  } catch (error) {
    console.error('setMemberRole failed:', error)
    return fail('errors.setRoleFailed')
  }
}

async function retireMember(tx: Tx, roomId: string, targetUserId: string): Promise<void> {
  await tx
    .update(roomMembers)
    .set({ leftAt: new Date() })
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, targetUserId)))
}

const removeMemberSchema = z.object({
  roomId: z.string().uuid(),
  targetUserId: z.string().uuid(),
})

export async function removeMember(
  input: z.infer<typeof removeMemberSchema>,
): Promise<ActionResult<{ targetUserId: string }>> {
  const userId = await currentUserId()
  if (!userId) return fail('errors.loginRequired')

  const parsed = removeMemberSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')
  const { roomId, targetUserId } = parsed.data
  if (targetUserId === userId) return fail('errors.cannotRemoveSelf')

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)
      if (!(await requireRole(tx, roomId, userId, ['host', 'dealer']))) {
        return fail('errors.dealerOrHostOnlyRemove')
      }

      const [room] = await tx
        .select({ status: rooms.status })
        .from(rooms)
        .where(eq(rooms.id, roomId))
        .limit(1)
      if (!room) return fail('errors.roomNotFound')
      if (room.status === 'settled' || room.status === 'closed') return fail('errors.roomEnded')

      const [target] = await tx
        .select({ role: roomMembers.role, leftAt: roomMembers.leftAt })
        .from(roomMembers)
        .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, targetUserId)))
        .limit(1)
      if (!target) return fail('errors.targetNotMember')
      if (target.leftAt) return fail('errors.alreadyLeft')
      if (target.role === 'host') return fail('errors.cannotRemoveHost')
      if (await isActiveRoundParticipant(tx, roomId, targetUserId)) {
        return fail('errors.cannotRemoveDuringRound')
      }

      await retireMember(tx, roomId, targetUserId)
      return ok({ targetUserId })
    })
  } catch (error) {
    console.error('removeMember failed:', error)
    return fail('errors.removeMemberFailed')
  }
}

const addLocalMemberSchema = z.object({
  roomId: z.string().uuid(),
  name: z.string().trim().min(1).max(20),
})

export async function addLocalMember(
  input: z.infer<typeof addLocalMemberSchema>,
): Promise<ActionResult<{ userId: string; name: string; seatNo: number }>> {
  const userId = await currentUserId()
  if (!userId) return fail('errors.loginRequired')

  const parsed = addLocalMemberSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')
  const { roomId, name } = parsed.data

  // 호출마다 `users` 행을 만드는 가장 값싼 남용 경로라 가장 좁게 잡는다. 정상 사용
  // 최악 케이스: 방 정원 상한(10, action-helpers.ts readMaxMembers)만큼 로컬 멤버를
  // 한 번에 채우면서 중복 이름 오타로 몇 번 더 재시도하는 것(분당), 모임 저녁 동안 방을
  // 몇 개(게임 종류 전환 등) 새로 꾸리며 그때마다 다시 채우는 것(시간당).
  const rate = await consumeRateLimitsUnlessAdmin(userId, [
    {
      scope: 'game.add_local_member.user.minute',
      identifier: userId,
      limit: 12,
      windowMs: 60 * 1000,
    },
    {
      scope: 'game.add_local_member.user.hour',
      identifier: userId,
      limit: 30,
      windowMs: 60 * 60 * 1000,
    },
  ])
  if (!rate.allowed) return fail('errors.addLocalMemberRateLimited')

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)
      if (!(await requireRole(tx, roomId, userId, ['host', 'dealer']))) {
        return fail('errors.dealerOrHostOnlyLocalMember')
      }

      const [room] = await tx.select().from(rooms).where(eq(rooms.id, roomId)).limit(1)
      if (!room) return fail('errors.roomNotFound')
      if (room.status === 'settled' || room.status === 'closed') return fail('errors.roomEnded')
      if (readFundingMode(room.rulePreset) === 'account_credit') {
        return fail('errors.localMemberNeedsSessionChips')
      }

      const maxMembers = readMaxMembers(room.rulePreset)
      const [active] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(roomMembers)
        .where(and(eq(roomMembers.roomId, roomId), isNull(roomMembers.leftAt)))
      if ((active?.count ?? 0) >= maxMembers) return fail('errors.roomFull')

      const [duplicate] = await tx
        .select({ id: users.id })
        .from(roomMembers)
        .innerJoin(users, eq(users.id, roomMembers.userId))
        .where(
          and(
            eq(roomMembers.roomId, roomId),
            isNull(roomMembers.leftAt),
            eq(users.displayName, name),
          ),
        )
        .limit(1)
      if (duplicate) return fail('errors.localMemberDuplicateName')

      const [created] = await tx
        .insert(users)
        .values({
          authentikSub: `managed:${roomId}:${randomUUID()}`,
          displayName: name,
          isManaged: true,
        })
        .returning({ id: users.id })
      if (!created) throw new Error('local member user insert failed')

      const [seat] = await tx
        .select({ next: sql<number>`coalesce(max(${roomMembers.seatNo}), -1) + 1` })
        .from(roomMembers)
        .where(eq(roomMembers.roomId, roomId))
      const seatNo = seat?.next ?? 0
      await tx.insert(roomMembers).values({ roomId, userId: created.id, role: 'player', seatNo })

      const [initialBuyIn] = await tx
        .insert(buyIns)
        .values({ roomId, userId: created.id, amount: room.startingChips, createdBy: userId })
        .returning({ id: buyIns.id })
      if (!initialBuyIn) throw new Error('local member initial buy-in insert failed')
      await tx.insert(chipLedger).values({
        roomId,
        userId: created.id,
        delta: room.startingChips,
        reason: 'buy_in',
        refBuyInId: initialBuyIn.id,
      })

      return ok({ userId: created.id, name, seatNo })
    })
  } catch (error) {
    console.error('addLocalMember failed:', error)
    return fail('errors.addLocalMemberFailed')
  }
}

const leaveRoomSchema = z.object({ roomId: z.string().uuid() })

export async function leaveRoom(
  input: z.infer<typeof leaveRoomSchema>,
): Promise<ActionResult<{ roomId: string }>> {
  const userId = await currentUserId()
  if (!userId) return fail('errors.loginRequired')

  const parsed = leaveRoomSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')
  const { roomId } = parsed.data

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)

      const [me] = await tx
        .select({ role: roomMembers.role, leftAt: roomMembers.leftAt })
        .from(roomMembers)
        .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)))
        .limit(1)
      if (!me) return fail('errors.notMember')
      if (me.leftAt) return ok({ roomId })
      if (me.role === 'host') return fail('errors.hostMustTransferBeforeLeave')

      const [room] = await tx
        .select({ status: rooms.status })
        .from(rooms)
        .where(eq(rooms.id, roomId))
        .limit(1)
      if (!room) return fail('errors.roomNotFound')
      if (room.status === 'settled' || room.status === 'closed') return fail('errors.roomEnded')
      if (await isActiveRoundParticipant(tx, roomId, userId)) {
        return fail('errors.cannotLeaveDuringRound')
      }

      await retireMember(tx, roomId, userId)
      return ok({ roomId })
    })
  } catch (error) {
    console.error('leaveRoom failed:', error)
    return fail('errors.leaveRoomFailed')
  }
}