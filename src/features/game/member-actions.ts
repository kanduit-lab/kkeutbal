'use server'

import { randomUUID } from 'node:crypto'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { db, schema } from '@/lib/db'
import { currentUserId } from '../auth/session'
import { lockRoom, readMaxMembers, requireRole, type Tx } from './action-helpers'
import { readFundingMode } from './funding-mode'

/** 멤버 역할 액션 — 방장 위임·역할 변경·내보내기·나가기·로컬 플레이어 추가. */

const { rooms, roomMembers, rounds, roundParticipants, users, buyIns, chipLedger } = schema

/** 판 참가자는 종료·무효 전까지 멤버십을 고정한다 — 중도 퇴장은 승자·정산 대상의 기준을 흔든다. */
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

/** 방장 위임 — 현재 방장은 player 로 내려가고 대상이 host 가 된다. */
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
        .select({ role: roomMembers.role, leftAt: roomMembers.leftAt })
        .from(roomMembers)
        .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, targetUserId)))
        .limit(1)
      if (!target || target.leftAt) return fail('errors.targetNotMember')
      if (target.role === 'observer') return fail('errors.observerCannotBecomeHost')

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

/** 딜러 재위임 등 역할 변경. host 역할 자체는 이 경로로 바꿀 수 없다. */
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

/** 퇴장은 멤버 상태만 바꾼다. 칩·바이인 기록은 최종 제로섬 정산과 전적을 위해 보존한다. */
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

/** 멤버 내보내기 — 방장·딜러 전용. 방장은 내보낼 수 없다. */
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

/**
 * 로컬 플레이어 추가 — 계정 없이 이름만으로 좌석을 만든다 (가족 게임 기록장 용도).
 *
 * 각자 폰으로 로그인하지 않고 호스트 한 대로 전원을 대신 기록하는 흐름이다.
 * 만들어지는 `users` 행은 `is_managed` 이고 `authentik_sub` 이 `managed:{roomId}:{uuid}` 라
 * 비밀번호·게스트 토큰·SSO 중 어떤 인증 경로로도 로그인되지 않는다. 실제 조작은
 * 딜러의 대리 베팅(ProxyBetSection)과 딜러 패널이 담당한다.
 *
 * 좌석·정원·시작 칩 규칙은 joinRoom 과 같다. 계정 크레딧 방은 참가자마다 실제 크레딧
 * 계정에서 잠금이 걸려야 하므로 로컬 플레이어를 받지 않는다.
 */
export async function addLocalMember(
  input: z.infer<typeof addLocalMemberSchema>,
): Promise<ActionResult<{ userId: string; name: string; seatNo: number }>> {
  const userId = await currentUserId()
  if (!userId) return fail('errors.loginRequired')

  const parsed = addLocalMemberSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')
  const { roomId, name } = parsed.data

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

      // 같은 방에서 같은 이름이 둘이면 대리 입력 때 누구를 고르는지 알 수 없다.
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
          // 어떤 인증 경로와도 겹치지 않는 네임스페이스. 로그인에 쓰이지 않는다
          // (내부 계정은 `local:{username}`, 게스트는 `guest:{tokenId}:{name}`).
          authentikSub: `managed:${roomId}:${randomUUID()}`,
          displayName: name,
          isManaged: true,
        })
        .returning({ id: users.id })
      if (!created) throw new Error('local member user insert failed')

      // 좌석 번호는 나간 멤버 포함 최댓값 +1 — (roomId, seatNo) unique 제약을 지킨다.
      const [seat] = await tx
        .select({ next: sql<number>`coalesce(max(${roomMembers.seatNo}), -1) + 1` })
        .from(roomMembers)
        .where(eq(roomMembers.roomId, roomId))
      const seatNo = seat?.next ?? 0
      await tx.insert(roomMembers).values({ roomId, userId: created.id, role: 'player', seatNo })

      // 시작 칩은 일반 참가자와 같은 경로로 지급한다 — 원장이 정본이라 여기를 건너뛰면
      // 손익 계산에서 이 좌석만 바이인 0 으로 남는다.
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

/** 방 나가기 — 본인 전용. 방장은 위임 후에만 나갈 수 있다. */
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
      if (me.leftAt) return ok({ roomId }) // 이미 나감 — 멱등
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
