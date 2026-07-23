'use server'

import { and, eq, isNull, ne, sql } from 'drizzle-orm'
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
  readJoinAsObserver,
  readMaxMembers,
  requireRole,
} from './action-helpers'
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
  if (!userId) return fail('errors.loginRequired')

  const parsed = createRoomSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')
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

  try {
    return await db.transaction(async (tx) => {
      const [room] = await tx.select().from(rooms).where(eq(rooms.code, code)).limit(1)
      if (!room) return fail('errors.roomCodeNotFound')
      if (room.status === 'settled' || room.status === 'closed') {
        return fail('errors.roomEnded')
      }

      await lockRoom(tx, room.id)

      const [existing] = await tx
        .select({ userId: roomMembers.userId, leftAt: roomMembers.leftAt })
        .from(roomMembers)
        .where(and(eq(roomMembers.roomId, room.id), eq(roomMembers.userId, userId)))
        .limit(1)
      if (existing && !existing.leftAt) return ok({ code: room.code }) // 재입장 — 멱등

      // 정원은 활동 중(leftAt null) 인원 기준 — 나간 자리는 다시 채울 수 있다.
      const maxMembers = readMaxMembers(room.rulePreset)
      const [active] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(roomMembers)
        .where(and(eq(roomMembers.roomId, room.id), isNull(roomMembers.leftAt)))
      if ((active?.count ?? 0) >= maxMembers) {
        return fail('errors.roomFull')
      }

      // 관전 입장 옵션 — 켜져 있으면 observer 로 들어가고 시작 칩을 받지 않는다.
      // 이후 setMemberRole 로 player 승격 시 멤버 시트의 바이인(addBuyIn) 흐름으로 칩을 받는다.
      const joinAsObserver = readJoinAsObserver(room.rulePreset)
      const entryRole = joinAsObserver ? 'observer' : 'player'

      if (existing) {
        // 재합류 — 좌석은 유지, 역할은 입장 옵션 기준으로 초기화, 시작 칩은 새로 지급한다.
        // joinedAt 을 갱신해야 "판 시작 후 입장" 베팅 가드가 재합류자에게도 적용된다.
        await tx
          .update(roomMembers)
          .set({ leftAt: null, role: entryRole, joinedAt: new Date() })
          .where(and(eq(roomMembers.roomId, room.id), eq(roomMembers.userId, userId)))
      } else {
        // 좌석 번호는 나간 멤버 포함 최댓값 +1 — (roomId, seatNo) unique 제약을 지킨다.
        const [seat] = await tx
          .select({ next: sql<number>`coalesce(max(${roomMembers.seatNo}), -1) + 1` })
          .from(roomMembers)
          .where(eq(roomMembers.roomId, room.id))
        await tx
          .insert(roomMembers)
          .values({ roomId: room.id, userId, role: entryRole, seatNo: seat?.next ?? 0 })
      }

      // observer 입장(신규·재합류 모두)은 시작 칩 지급 없음 — player 승격 시 바이인으로 받는다.
      if (!joinAsObserver) {
        await tx
          .insert(buyIns)
          .values({ roomId: room.id, userId, amount: room.startingChips, createdBy: userId })
        await tx.insert(chipLedger).values({
          roomId: room.id,
          userId,
          delta: room.startingChips,
          reason: 'buy_in',
        })
      }

      return ok({ code: room.code })
    })
  } catch (error) {
    console.error('joinRoom failed:', error)
    return fail('errors.joinRoomFailed')
  }
}

/**
 * form action 용 래퍼 — 성공하면 방으로 이동한다.
 * 실패 시 `result.error`(`errors.*` 키)를 그대로 `?error=` 에 실어 홈으로 돌려보낸다 —
 * 홈 페이지(app/page.tsx)가 그 키를 사전으로 옮겨 렌더한다.
 */
export async function joinRoomAndGo(formData: FormData): Promise<void> {
  const code = String(formData.get('code') ?? '')
  const result = await joinRoom(code)
  if (result.success) redirect(`/rooms/${result.data.code}`)
  redirect(`/?error=${encodeURIComponent(result.error)}`)
}

export async function refreshRoom(roomId: string): Promise<ActionResult<RoomSnapshot>> {
  if (!(await currentUserId())) return fail('errors.loginRequired')
  if (!z.string().uuid().safeParse(roomId).success) return fail('errors.invalidRoom')

  // 클라이언트가 폴링·디바운스로 반복 호출한다 — 일시 오류가 unhandled rejection 으로 새면 안 된다.
  try {
    const snapshot = await getRoomSnapshot(roomId)
    if (!snapshot) return fail('errors.roomNotFound')
    // 읽기는 로그인 사용자 전원 허용 — 전광판 관전용이고 스냅샷은 점수판 데이터라 비밀이 없다.
    // 쓰기 액션은 각자 멤버·역할 검사를 유지한다: placeBet 계열은 참가자 확인(betting/actions.ts),
    // addBuyIn·undoLastBuyIn 은 참가자·딜러 확인(budget/actions.ts), 판·역할·옵션·정산 액션은
    // requireRole(round-actions.ts·member-actions.ts·이 파일) — 전수 확인함.
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
  /** 방 정원 (활동 인원 기준). rulePreset 에 저장된다. */
  maxMembers: z.number().int().min(2).max(10).optional(),
  /** 신규 입장자를 관전자로 받을지. rulePreset 에 저장된다. */
  joinAsObserver: z.boolean().optional(),
  /** 시작 칩 — 대기 중 + 판 기록이 없을 때만 변경할 수 있다. */
  startingChips: z.number().int().min(1).max(1_000_000).optional(),
})

/** 방 옵션 변경 — 방장 전용. 진행 중에도 다음 액션부터 새 옵션이 적용된다. */
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

      // 시작 칩 변경은 첫 판 전에만 — 판이 시작된 뒤에는 손익·팟 계산의 기준이 흔들린다.
      // 같은 값 재전송은 no-op 으로 통과시킨다 (설정 폼이 현재 값을 항상 보내도 안전).
      const startingChips =
        parsed.data.startingChips !== undefined &&
        parsed.data.startingChips !== room.startingChips
          ? parsed.data.startingChips
          : undefined
      if (startingChips !== undefined) {
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
        // 시작 칩을 이미 받은 활동 멤버 전원에게 차액(new - old)을 같은 트랜잭션에서 정정한다
        // — buy_ins 합계와 chip_ledger 잔액이 새 시작 칩과 일치하게 유지된다.
        // observer 는 시작 칩을 받지 않았으므로 제외 (승격 시 바이인으로 받는다).
        const delta = startingChips - room.startingChips
        const targets = await tx
          .select({ userId: roomMembers.userId })
          .from(roomMembers)
          .where(
            and(
              eq(roomMembers.roomId, roomId),
              isNull(roomMembers.leftAt),
              ne(roomMembers.role, 'observer'),
            ),
          )
        if (targets.length > 0) {
          await tx.insert(buyIns).values(
            targets.map((member) => ({
              roomId,
              userId: member.userId,
              amount: delta,
              createdBy: userId,
            })),
          )
          await tx.insert(chipLedger).values(
            targets.map((member) => ({
              roomId,
              userId: member.userId,
              delta,
              reason: 'buy_in' as const,
            })),
          )
        }
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
