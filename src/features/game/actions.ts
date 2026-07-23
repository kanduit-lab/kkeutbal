'use server'

import { and, eq, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { db, schema } from '@/lib/db'
import { currentUserId } from '../auth/session'
import { generateRoomCode, normalizeRoomCode } from './room-code'
import { getRoomSnapshot } from './queries'
import { isUniqueViolation, lockRoom, requireRole } from './action-helpers'
import type { RoomSnapshot } from './types'

/**
 * 방 수명주기 액션 — 생성·입장·스냅샷·옵션 변경·정산.
 * 판 진행은 round-actions.ts, 역할 변경은 member-actions.ts.
 */

const { rooms, roomMembers, rounds, chipLedger, buyIns } = schema

const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(30),
  gameType: z.enum(['seotda', 'gostop', 'poker']),
  inputMode: z.enum(['trust', 'approval']),
  startingChips: z.number().int().min(1).max(1_000_000),
  /** 고스톱 점당 칩. 고스톱 외 게임에서는 무시된다. */
  pointValue: z.number().int().min(1).max(100_000).optional(),
  /** 베팅 기본 단위(삥). 미지정 시 시작 칩의 1%. */
  baseBet: z.number().int().min(1).max(1_000_000).optional(),
})

export async function createRoom(
  input: z.infer<typeof createRoomSchema>,
): Promise<ActionResult<{ code: string }>> {
  const userId = await currentUserId()
  if (!userId) return fail('로그인이 필요합니다')

  const parsed = createRoomSchema.safeParse(input)
  if (!parsed.success) return fail('입력값이 올바르지 않습니다')
  const { name, gameType, inputMode, startingChips, pointValue, baseBet } = parsed.data
  const rulePreset =
    gameType === 'gostop'
      ? { pointValue: pointValue ?? 10 }
      : baseBet
        ? { baseBet }
        : {}

  // 코드 충돌은 UNIQUE 가 잡는다. 확률상 1~2회 재시도면 충분하다.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateRoomCode()
    try {
      const createdCode = await db.transaction(async (tx) => {
        const [room] = await tx
          .insert(rooms)
          .values({ code, hostId: userId, name, gameType, inputMode, startingChips, rulePreset })
          .returning({ id: rooms.id, code: rooms.code })
        if (!room) throw new Error('room insert failed')

        await tx.insert(roomMembers).values({
          roomId: room.id,
          userId,
          role: 'host',
          seatNo: 0,
        })
        await tx
          .insert(buyIns)
          .values({ roomId: room.id, userId, amount: startingChips, createdBy: userId })
        await tx.insert(chipLedger).values({
          roomId: room.id,
          userId,
          delta: startingChips,
          reason: 'buy_in',
        })
        return room.code
      })
      return ok({ code: createdCode })
    } catch (error) {
      if (isUniqueViolation(error)) continue
      console.error('createRoom failed:', error)
      return fail('방 생성에 실패했습니다')
    }
  }
  return fail('방 코드 생성에 실패했습니다. 다시 시도해주세요')
}

export async function joinRoom(codeRaw: string): Promise<ActionResult<{ code: string }>> {
  const userId = await currentUserId()
  if (!userId) return fail('로그인이 필요합니다')

  const code = normalizeRoomCode(codeRaw)
  if (!/^[A-Z2-9]{6}$/.test(code)) return fail('방 코드는 6자입니다')

  try {
    return await db.transaction(async (tx) => {
      const [room] = await tx.select().from(rooms).where(eq(rooms.code, code)).limit(1)
      if (!room) return fail('그 코드로 만든 방이 없습니다')
      if (room.status === 'settled' || room.status === 'closed') {
        return fail('이미 끝난 방입니다')
      }

      await lockRoom(tx, room.id)

      const [existing] = await tx
        .select({ userId: roomMembers.userId })
        .from(roomMembers)
        .where(and(eq(roomMembers.roomId, room.id), eq(roomMembers.userId, userId)))
        .limit(1)
      if (existing) return ok({ code: room.code }) // 재입장 — 멱등

      const [seat] = await tx
        .select({ next: sql<number>`coalesce(max(${roomMembers.seatNo}), -1) + 1` })
        .from(roomMembers)
        .where(eq(roomMembers.roomId, room.id))
      const seatNo = seat?.next ?? 0
      if (seatNo > 9) return fail('방이 가득 찼습니다 (최대 10명)')

      await tx.insert(roomMembers).values({ roomId: room.id, userId, role: 'player', seatNo })
      await tx
        .insert(buyIns)
        .values({ roomId: room.id, userId, amount: room.startingChips, createdBy: userId })
      await tx.insert(chipLedger).values({
        roomId: room.id,
        userId,
        delta: room.startingChips,
        reason: 'buy_in',
      })

      return ok({ code: room.code })
    })
  } catch (error) {
    console.error('joinRoom failed:', error)
    return fail('입장에 실패했습니다')
  }
}

/** form action 용 래퍼 — 성공하면 방으로 이동한다. */
export async function joinRoomAndGo(formData: FormData): Promise<void> {
  const code = String(formData.get('code') ?? '')
  const result = await joinRoom(code)
  if (result.success) redirect(`/rooms/${result.data.code}`)
  redirect(`/?error=${encodeURIComponent(result.error)}`)
}

export async function refreshRoom(roomId: string): Promise<ActionResult<RoomSnapshot>> {
  const userId = await currentUserId()
  if (!userId) return fail('로그인이 필요합니다')
  if (!z.string().uuid().safeParse(roomId).success) return fail('방 정보가 올바르지 않습니다')

  const snapshot = await getRoomSnapshot(roomId)
  if (!snapshot) return fail('방을 찾을 수 없습니다')
  if (!snapshot.members.some((member) => member.userId === userId)) {
    return fail('이 방의 참가자가 아닙니다')
  }
  return ok(snapshot)
}

const updateSettingsSchema = z.object({
  roomId: z.string().uuid(),
  name: z.string().trim().min(1).max(30),
  inputMode: z.enum(['trust', 'approval']),
  pointValue: z.number().int().min(1).max(100_000).optional(),
  baseBet: z.number().int().min(1).max(1_000_000).optional(),
})

/** 방 옵션 변경 — 방장 전용. 진행 중에도 다음 액션부터 새 옵션이 적용된다. */
export async function updateRoomSettings(
  input: z.infer<typeof updateSettingsSchema>,
): Promise<ActionResult<{ roomId: string }>> {
  const userId = await currentUserId()
  if (!userId) return fail('로그인이 필요합니다')

  const parsed = updateSettingsSchema.safeParse(input)
  if (!parsed.success) return fail('입력값이 올바르지 않습니다')
  const { roomId, name, inputMode, pointValue, baseBet } = parsed.data

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)
      if (!(await requireRole(tx, roomId, userId, ['host']))) {
        return fail('방장만 방 옵션을 바꿀 수 있습니다')
      }

      const [room] = await tx.select().from(rooms).where(eq(rooms.id, roomId)).limit(1)
      if (!room) return fail('방을 찾을 수 없습니다')
      if (room.status === 'settled' || room.status === 'closed') return fail('이미 끝난 방입니다')

      const preset =
        room.rulePreset && typeof room.rulePreset === 'object'
          ? (room.rulePreset as Record<string, unknown>)
          : {}
      const rulePreset = {
        ...preset,
        ...(room.gameType === 'gostop' && pointValue ? { pointValue } : {}),
        ...(room.gameType !== 'gostop' && baseBet ? { baseBet } : {}),
      }

      await tx.update(rooms).set({ name, inputMode, rulePreset }).where(eq(rooms.id, roomId))
      return ok({ roomId })
    })
  } catch (error) {
    console.error('updateRoomSettings failed:', error)
    return fail('방 옵션 변경에 실패했습니다')
  }
}

export async function closeRoom(roomId: string): Promise<ActionResult<{ code: string }>> {
  const userId = await currentUserId()
  if (!userId) return fail('로그인이 필요합니다')
  if (!z.string().uuid().safeParse(roomId).success) return fail('잘못된 방입니다')

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)
      if (!(await requireRole(tx, roomId, userId, ['host']))) {
        return fail('방장만 세션을 정산할 수 있습니다')
      }

      const [playing] = await tx
        .select({ id: rounds.id })
        .from(rounds)
        .where(and(eq(rounds.roomId, roomId), eq(rounds.status, 'playing')))
        .limit(1)
      if (playing) return fail('진행 중인 판을 먼저 끝내거나 무효화하세요')

      const [room] = await tx
        .update(rooms)
        .set({ status: 'settled', closedAt: new Date() })
        .where(eq(rooms.id, roomId))
        .returning({ code: rooms.code })
      if (!room) return fail('방을 찾을 수 없습니다')

      return ok({ code: room.code })
    })
  } catch (error) {
    console.error('closeRoom failed:', error)
    return fail('정산에 실패했습니다')
  }
}
