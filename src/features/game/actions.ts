'use server'

import { and, eq, isNull, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { db, schema } from '@/lib/db'
import { currentUserId } from '../auth/session'
import { generateRoomCode, normalizeRoomCode } from './room-code'
import { getRoomSnapshot } from './queries'
import {
  isUniqueViolation,
  lockRoom,
  netTotalInRoom,
  readJoinAsObserver,
  readMaxMembers,
  requireRole,
} from './action-helpers'
import { applyStartingChipsAdjustment, recordInitialBuyIn } from './buy-in-ledger'
import { settleRoomCredits } from './credit-rpc'
import { checkCreateRoomRateLimit, checkJoinRoomRateLimit } from './room-rate-limits'
import { fundingModeSchema, readFundingMode } from './funding-mode'
import {
  fairPlaySettingsSchema,
  parseFairPlaySettings,
  readFairPlaySettings,
} from './fair-play-settings'
import type { RoomSnapshot } from './types'

const { rooms, roomMembers, rounds } = schema

const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(30),
  gameType: z.enum(['seotda', 'gostop', 'poker']),
  inputMode: z.enum(['trust', 'approval']),
  startingChips: z.number().int().min(1).max(1_000_000),
  pointValue: z.number().int().min(1).max(100_000).optional(),
  baseBet: z.number().int().min(1).max(1_000_000).optional(),
  fundingMode: fundingModeSchema.default('session'),
  raiseRule: z.enum(['free', 'ttadang', 'pot_limit']).default('free'),
  fairPlay: fairPlaySettingsSchema.optional(),
})

export async function createRoom(
  input: z.input<typeof createRoomSchema>,
): Promise<ActionResult<{ code: string }>> {
  const userId = await currentUserId()
  if (!userId) return fail('errors.loginRequired')

  const parsed = createRoomSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')
  const { name, gameType, inputMode, startingChips, pointValue, baseBet, fundingMode, raiseRule } =
    parsed.data
  let fairPlay: ReturnType<typeof parseFairPlaySettings> | undefined
  try {
    fairPlay = parsed.data.fairPlay
      ? parseFairPlaySettings(gameType, parsed.data.fairPlay)
      : undefined
  } catch {
    return fail('errors.invalidInput')
  }

  const rate = await checkCreateRoomRateLimit(userId)
  if (!rate.allowed) return fail('errors.createRoomRateLimited')

  const rulePreset = {
    fundingMode,
    ...(gameType === 'gostop' ? { pointValue: pointValue ?? 10 } : baseBet ? { baseBet } : {}),
    // 고스톱은 베팅이 없으니 레이즈 규칙도 의미가 없다 — free로 저장돼도 readRaiseRule
    // 기본값과 같아 무해하지만, 저장하지 않아 blob을 깔끔하게 유지한다.
    ...(gameType !== 'gostop' ? { raiseRule } : {}),
    ...(fairPlay ? { fair_play: fairPlay } : {}),
  }

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
        await recordInitialBuyIn(tx, {
          roomId: room.id,
          userId,
          amount: startingChips,
          fundingMode,
        })
        return room.code
      })
      return ok({ code: createdCode })
    } catch (error) {
      if (isUniqueViolation(error)) continue
      console.error('createRoom failed:', error)
      return fail('errors.createRoomFailed')
    }
  }
  return fail('errors.roomCodeGenFailed')
}

export async function joinRoom(codeRaw: string): Promise<ActionResult<{ code: string }>> {
  const userId = await currentUserId()
  if (!userId) return fail('errors.loginRequired')

  const code = normalizeRoomCode(codeRaw)
  if (!/^[A-Z2-9]{6}$/.test(code)) return fail('errors.codeLength')

  const rate = await checkJoinRoomRateLimit(userId)
  if (!rate.allowed) return fail('errors.joinRoomRateLimited')

  try {
    return await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ id: rooms.id })
        .from(rooms)
        .where(eq(rooms.code, code))
        .limit(1)
      if (!target) return fail('errors.roomCodeNotFound')

      await lockRoom(tx, target.id)

      const [room] = await tx.select().from(rooms).where(eq(rooms.id, target.id)).limit(1)
      if (!room) return fail('errors.roomCodeNotFound')
      if (room.status === 'settled' || room.status === 'closed') {
        return fail('errors.roomEnded')
      }

      const [existing] = await tx
        .select({ userId: roomMembers.userId, leftAt: roomMembers.leftAt })
        .from(roomMembers)
        .where(and(eq(roomMembers.roomId, room.id), eq(roomMembers.userId, userId)))
        .limit(1)
      if (existing && !existing.leftAt) return ok({ code: room.code })

      const maxMembers = readMaxMembers(room.rulePreset)
      const [active] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(roomMembers)
        .where(and(eq(roomMembers.roomId, room.id), isNull(roomMembers.leftAt)))
      if ((active?.count ?? 0) >= maxMembers) {
        return fail('errors.roomFull')
      }

      const joinAsObserver = readJoinAsObserver(room.rulePreset)
      const entryRole = joinAsObserver ? 'observer' : 'player'

      if (existing) {
        await tx
          .update(roomMembers)
          .set({ leftAt: null, role: entryRole, joinedAt: new Date() })
          .where(and(eq(roomMembers.roomId, room.id), eq(roomMembers.userId, userId)))
      } else {
        const [seat] = await tx
          .select({ next: sql<number>`coalesce(max(${roomMembers.seatNo}), -1) + 1` })
          .from(roomMembers)
          .where(eq(roomMembers.roomId, room.id))
        await tx
          .insert(roomMembers)
          .values({ roomId: room.id, userId, role: entryRole, seatNo: seat?.next ?? 0 })
      }

      if (!existing && !joinAsObserver) {
        await recordInitialBuyIn(tx, {
          roomId: room.id,
          userId,
          amount: room.startingChips,
          fundingMode: readFundingMode(room.rulePreset),
        })
      }

      return ok({ code: room.code })
    })
  } catch (error) {
    console.error('joinRoom failed:', error)
    return fail('errors.joinRoomFailed')
  }
}

export async function joinRoomAndGo(formData: FormData): Promise<void> {
  const code = String(formData.get('code') ?? '')
  const result = await joinRoom(code)
  if (result.success) redirect(`/rooms/${result.data.code}`)
  redirect(`/?error=${encodeURIComponent(result.error)}`)
}

export async function refreshRoom(roomId: string): Promise<ActionResult<RoomSnapshot>> {
  if (!(await currentUserId())) return fail('errors.loginRequired')
  if (!z.string().uuid().safeParse(roomId).success) return fail('errors.invalidRoom')

  try {
    const snapshot = await getRoomSnapshot(roomId)
    if (!snapshot) return fail('errors.roomNotFound')

    return ok(snapshot)
  } catch (error) {
    console.error('refreshRoom failed:', error)
    return fail('errors.roomFetchFailed')
  }
}

const updateSettingsSchema = z.object({
  roomId: z.string().uuid(),
  name: z.string().trim().min(1).max(30),
  inputMode: z.enum(['trust', 'approval']),
  pointValue: z.number().int().min(1).max(100_000).optional(),
  baseBet: z.number().int().min(1).max(1_000_000).optional(),
  maxMembers: z.number().int().min(2).max(10).optional(),
  joinAsObserver: z.boolean().optional(),
  startingChips: z.number().int().min(1).max(1_000_000).optional(),
  fairPlay: fairPlaySettingsSchema.optional(),
})

export async function updateRoomSettings(
  input: z.infer<typeof updateSettingsSchema>,
): Promise<ActionResult<{ roomId: string }>> {
  const userId = await currentUserId()
  if (!userId) return fail('errors.loginRequired')

  const parsed = updateSettingsSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')
  const { roomId, name, inputMode, pointValue, baseBet, maxMembers, joinAsObserver } = parsed.data

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)
      if (!(await requireRole(tx, roomId, userId, ['host']))) {
        return fail('errors.hostOnlySettings')
      }

      const [room] = await tx.select().from(rooms).where(eq(rooms.id, roomId)).limit(1)
      if (!room) return fail('errors.roomNotFound')
      if (room.status === 'settled' || room.status === 'closed') return fail('errors.roomEnded')

      const startingChips =
        parsed.data.startingChips !== undefined && parsed.data.startingChips !== room.startingChips
          ? parsed.data.startingChips
          : undefined
      let fairPlay: ReturnType<typeof parseFairPlaySettings> | undefined
      try {
        fairPlay = parsed.data.fairPlay
          ? parseFairPlaySettings(room.gameType, parsed.data.fairPlay)
          : undefined
      } catch {
        return fail('errors.updateSettingsFailed')
      }
      if (startingChips !== undefined) {
        if (readFundingMode(room.rulePreset) === 'account_credit') {
          return fail('errors.updateSettingsFailed')
        }
        if (room.status !== 'waiting') {
          return fail('errors.startingChipsWaitingOnly')
        }
        const [anyRound] = await tx
          .select({ id: rounds.id })
          .from(rounds)
          .where(eq(rounds.roomId, roomId))
          .limit(1)
        if (anyRound) return fail('errors.startingChipsHasRounds')
      }

      if (maxMembers !== undefined) {
        const [activeMembers] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(roomMembers)
          .where(and(eq(roomMembers.roomId, roomId), isNull(roomMembers.leftAt)))
        if ((activeMembers?.count ?? 0) > maxMembers) {
          return fail('errors.maxMembersBelowCurrent')
        }
      }

      if (fairPlay !== undefined) {
        const [anyRound] = await tx
          .select({ id: rounds.id })
          .from(rounds)
          .where(eq(rounds.roomId, roomId))
          .limit(1)
        if (
          anyRound &&
          JSON.stringify(fairPlay) !==
            JSON.stringify(readFairPlaySettings(room.gameType, room.rulePreset))
        ) {
          return fail('errors.fairPlayLocked')
        }
      }

      const preset =
        room.rulePreset && typeof room.rulePreset === 'object'
          ? (room.rulePreset as Record<string, unknown>)
          : {}
      const rulePreset = {
        ...preset,
        ...(room.gameType === 'gostop' && pointValue ? { pointValue } : {}),
        ...(room.gameType !== 'gostop' && baseBet ? { baseBet } : {}),
        ...(maxMembers !== undefined ? { maxMembers } : {}),
        ...(joinAsObserver !== undefined ? { joinAsObserver } : {}),
        ...(fairPlay !== undefined ? { fair_play: fairPlay } : {}),
      }

      await tx
        .update(rooms)
        .set({
          name,
          inputMode,
          rulePreset,
          ...(startingChips !== undefined ? { startingChips } : {}),
        })
        .where(eq(rooms.id, roomId))

      if (startingChips !== undefined) {
        const adjustment = await applyStartingChipsAdjustment(tx, {
          roomId,
          createdBy: userId,
          startingChips,
          previousStartingChips: room.startingChips,
        })
        if (!adjustment.ok) return fail(adjustment.error)
      }

      return ok({ roomId })
    })
  } catch (error) {
    console.error('updateRoomSettings failed:', error)
    return fail('errors.updateSettingsFailed')
  }
}

export async function closeRoom(roomId: string): Promise<ActionResult<{ code: string }>> {
  const userId = await currentUserId()
  if (!userId) return fail('errors.loginRequired')
  if (!z.string().uuid().safeParse(roomId).success) return fail('errors.invalidRoom')

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)
      if (!(await requireRole(tx, roomId, userId, ['host']))) {
        return fail('errors.hostOnlySettle')
      }

      const [playing] = await tx
        .select({ id: rounds.id })
        .from(rounds)
        .where(and(eq(rounds.roomId, roomId), eq(rounds.status, 'playing')))
        .limit(1)
      if (playing) return fail('errors.activeRoundBeforeSettle')
      if ((await netTotalInRoom(tx, roomId)) !== 0) {
        return fail('errors.settlementNotBalanced')
      }

      const [roomBeforeClose] = await tx
        .select({ rulePreset: rooms.rulePreset })
        .from(rooms)
        .where(eq(rooms.id, roomId))
        .limit(1)
      if (!roomBeforeClose) return fail('errors.roomNotFound')
      if (readFundingMode(roomBeforeClose.rulePreset) === 'account_credit') {
        await settleRoomCredits(tx, roomId, userId)
      }

      const [room] = await tx
        .update(rooms)
        .set({ status: 'settled', closedAt: new Date() })
        .where(eq(rooms.id, roomId))
        .returning({ code: rooms.code })
      if (!room) return fail('errors.roomNotFound')

      return ok({ code: room.code })
    })
  } catch (error) {
    console.error('closeRoom failed:', error)
    return fail('errors.settleFailed')
  }
}
