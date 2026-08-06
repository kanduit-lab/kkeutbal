'use server'

import { and, eq, isNull, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { db, schema } from '@/lib/db'
import { currentUserId } from '../auth/session'
import { generateRoomCode, normalizeRoomCode } from './room-code'
import { getMemberRole, getRoomSnapshot } from './queries'
import {
  isUniqueViolation,
  lockRoom,
  netTotalInRoom,
  readJoinAsObserver,
  readMaxMembers,
  requireRole,
  type Tx,
} from './action-helpers'
import { applyStartingChipsAdjustment, recordInitialBuyIn } from './buy-in-ledger'
import { isInsufficientCreditError, settleRoomCredits } from './credit-rpc'
import { checkCreateRoomRateLimit, checkJoinRoomRateLimit } from './room-rate-limits'
import { fundingModeSchema, readFundingMode } from './funding-mode'
import {
  fairPlaySettingsSchema,
  parseFairPlaySettings,
  readFairPlaySettings,
} from './fair-play-settings'
import type { RoomSnapshot } from './types'

const { rooms, roomMembers, rounds, buyIns, chipLedger, roomCreditLocks } = schema

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
      // 계정 크레딧 방은 만드는 순간 방장의 시작 칩만큼 크레딧을 잠근다. 잔액이 모자라면
      // DB가 거절하는데, 그걸 일반 실패로 뭉개면 "방 생성에 실패했습니다"만 뜨고 시작 칩을
      // 낮추면 된다는 사실이 화면 어디에도 없다.
      if (isInsufficientCreditError(error)) return fail('errors.insufficientCredit')
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

      // 재입장은 두고 간 칩을 그대로 되찾는 것이라 바이인을 새로 찍지 않는다. 다만 판정
      // 기준이 "처음 들어오는가"가 아니라 "이 방에 바이인이 하나라도 있는가"여야 한다 —
      // 관전자로 들어왔다 나간 사람은 바이인이 한 번도 없어서, 참가자로 돌아오면 칩 0으로
      // 자리에 앉는다. `startRound`는 관전자가 아닌 활성 멤버를 전부 판에 넣으므로 그 사람은
      // 아무 것도 걸지 못한 채 판에 들어가고, 계정 크레딧 방에서 그 사람이 판을 이기면
      // **잠긴 크레딧 없이 칩만 가진 참가자**가 생겨 `settle_room_credits`의 보존식이 깨진다.
      // 그러면 방장도 관리자도 방을 닫을 수 없고 나머지 참가자의 크레딧까지 계속 잠긴다.
      if (!joinAsObserver) {
        const [priorBuyIn] = await tx
          .select({ id: buyIns.id })
          .from(buyIns)
          .where(and(eq(buyIns.roomId, room.id), eq(buyIns.userId, userId)))
          .limit(1)
        if (!priorBuyIn) {
          await recordInitialBuyIn(tx, {
            roomId: room.id,
            userId,
            amount: room.startingChips,
            fundingMode: readFundingMode(room.rulePreset),
          })
        }
      }

      return ok({ code: room.code })
    })
  } catch (error) {
    if (isInsufficientCreditError(error)) return fail('errors.insufficientCredit')
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
  const userId = await currentUserId()
  if (!userId) return fail('errors.loginRequired')
  if (!z.string().uuid().safeParse(roomId).success) return fail('errors.invalidRoom')

  // 스냅샷에는 참가자 전원의 잔액·바이인 총액과 이번 판의 베팅 전체가 들어 있다.
  // 예전에는 로그인만 확인해서, 방 uuid만 알면 누구든(방에서 내보내진 사람 포함) 그
  // 방의 돈을 계속 들여다볼 수 있었다 — uuid는 클라이언트 페이로드와 공개 realtime
  // 채널 이름(`room:{uuid}`)에 그대로 실려 나가므로 비밀이 아니다.
  if (!(await getMemberRole(roomId, userId))) return fail('errors.notMember')

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
          // 소급 지급·회수는 크레딧 잠금을 함께 움직이지 않는다(`applyStartingChipsAdjustment`).
          // 막는 것 자체는 원래 동작이고, 여기서는 이유를 이름 붙여 돌려준다 — 예전에는
          // 일반 실패와 같은 문구라 방장이 무엇을 되돌려야 하는지 알 수 없었다.
          return fail('errors.startingChipsAccountCredit')
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

      const [roomBeforeClose] = await tx
        .select({ status: rooms.status, rulePreset: rooms.rulePreset })
        .from(rooms)
        .where(eq(rooms.id, roomId))
        .limit(1)
      if (!roomBeforeClose) return fail('errors.roomNotFound')
      // 이미 끝난 방은 다시 닫지 않는다. 다른 쓰기 액션(`voidRound`·`adminCloseRoom`·
      // `updateRoomSettings`·`addBuyIn`)은 전부 하는 검사가 여기만 빠져 있었다 — 두 번째
      // 호출이 통과하면 `closedAt`이 지금으로 다시 찍혀서, 랭킹의 기간 필터(`closedAt >= since`)와
      // 홈 "지난 세션" 정렬이 실제로 끝난 시각에서 밀린다.
      if (roomBeforeClose.status === 'settled' || roomBeforeClose.status === 'closed') {
        return fail('errors.roomEnded')
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

      if (readFundingMode(roomBeforeClose.rulePreset) === 'account_credit') {
        // `settle_room_credits`는 **활성 잠금 보유자**를 기준으로 세션 잔액을 조인한다. 잠금
        // 없이 칩만 가진 사람이 하나라도 있으면 그 칩이 보존식 양쪽에서 통째로 빠져 함수가
        // 예외를 던지고, 방장도 관리자 강제 정산도 실패해 **나머지 참가자의 크레딧까지 계속
        // 잠긴 채로 남는다**. 예외를 그냥 받으면 화면에는 원인 없는 "정산에 실패했습니다"만
        // 뜬다 — 복구는 관리자 전용 `admin_repair_room_credit_settlement`이므로
        // (`docs/10-virtual-credit-and-fair-play.md`) 그쪽으로 보내는 문구를 준다.
        if (await hasStrandedChipHolder(tx, roomId)) {
          return fail('errors.roomCreditsStranded')
        }
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

/**
 * 계정 크레딧 방에서 "잠긴 크레딧 없이 칩만 가진 참가자"가 있는지 본다.
 *
 * 방 전체 원장 합은 늘 바이인 합과 같고(`netTotalInRoom`), 계정 크레딧 방에서는 바이인 합이
 * 곧 활성 잠금 합이다 — 잠금 없는 바이인을 만드는 경로(`addLocalMember`,
 * `applyStartingChipsAdjustment`)는 이 재원 모드에서 모두 막혀 있다. 그래서 잠금 보유자만
 * 모은 `settle_room_credits`의 보존식이 깨지는 조건은 정확히 "잠금 없는 칩 보유자가 있다"이다.
 * 칩 잔액은 음수가 될 수 없으므로 한 명이라도 있으면 합이 어긋난다.
 *
 * 판정만 하고 아무 것도 쓰지 않는다 — 실제 복구는 관리자 전용 RPC의 몫이다.
 */
async function hasStrandedChipHolder(tx: Tx, roomId: string): Promise<boolean> {
  const [stranded] = await tx
    .select({ userId: chipLedger.userId })
    .from(chipLedger)
    .where(
      and(
        eq(chipLedger.roomId, roomId),
        sql`not exists (
          select 1 from ${roomCreditLocks}
          where ${roomCreditLocks.roomId} = ${roomId}
            and ${roomCreditLocks.userId} = ${chipLedger.userId}
            and ${roomCreditLocks.releasedTransactionId} is null
        )`,
      ),
    )
    .groupBy(chipLedger.userId)
    .having(sql`coalesce(sum(${chipLedger.delta}), 0) <> 0`)
    .limit(1)
  return Boolean(stranded)
}
