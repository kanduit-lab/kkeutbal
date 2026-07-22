'use server'

import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { db, schema } from '@/lib/db'
import { currentUserId } from '../auth/session'
import { generateRoomCode, normalizeRoomCode } from './room-code'
import { getRoomSnapshot, getRoundPot } from './queries'
import type { RoomSnapshot } from './types'

const { rooms, roomMembers, rounds, chipLedger, buyIns } = schema

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** 방 단위 직렬화. 칩 이동·판 전환의 경쟁 조건을 트랜잭션 advisory lock 으로 막는다. */
async function lockRoom(tx: Tx, roomId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${roomId}, 42))`)
}

async function requireRole(
  tx: Tx,
  roomId: string,
  userId: string,
  roles: readonly string[],
): Promise<boolean> {
  const [member] = await tx
    .select({ role: roomMembers.role })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)))
    .limit(1)
  return member ? roles.includes(member.role) : false
}

const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(30),
  gameType: z.enum(['seotda', 'gostop', 'poker']),
  inputMode: z.enum(['trust', 'approval']),
  startingChips: z.number().int().min(1).max(1_000_000),
})

export async function createRoom(
  input: z.infer<typeof createRoomSchema>,
): Promise<ActionResult<{ code: string }>> {
  const userId = await currentUserId()
  if (!userId) return fail('로그인이 필요합니다')

  const parsed = createRoomSchema.safeParse(input)
  if (!parsed.success) return fail('입력값이 올바르지 않습니다')
  const { name, gameType, inputMode, startingChips } = parsed.data

  // 코드 충돌은 UNIQUE 가 잡는다. 확률상 1~2회 재시도면 충분하다.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateRoomCode()
    try {
      const createdCode = await db.transaction(async (tx) => {
        const [room] = await tx
          .insert(rooms)
          .values({ code, hostId: userId, name, gameType, inputMode, startingChips })
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

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505')
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

export async function startRound(
  roomId: string,
): Promise<ActionResult<{ roundId: string; seq: number }>> {
  const userId = await currentUserId()
  if (!userId) return fail('로그인이 필요합니다')

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)
      if (!(await requireRole(tx, roomId, userId, ['host', 'dealer']))) {
        return fail('딜러 또는 방장만 판을 시작할 수 있습니다')
      }

      const [room] = await tx.select().from(rooms).where(eq(rooms.id, roomId)).limit(1)
      if (!room) return fail('방을 찾을 수 없습니다')
      if (room.status === 'settled' || room.status === 'closed') return fail('이미 끝난 방입니다')

      const [playing] = await tx
        .select({ id: rounds.id })
        .from(rounds)
        .where(and(eq(rounds.roomId, roomId), eq(rounds.status, 'playing')))
        .limit(1)
      if (playing) return fail('진행 중인 판이 있습니다')

      const [maxSeq] = await tx
        .select({ max: sql<number>`coalesce(max(${rounds.seq}), 0)` })
        .from(rounds)
        .where(eq(rounds.roomId, roomId))
      const seq = (maxSeq?.max ?? 0) + 1

      const [round] = await tx
        .insert(rounds)
        .values({ roomId, seq })
        .returning({ id: rounds.id, seq: rounds.seq })
      if (!round) return fail('판 생성에 실패했습니다')

      if (room.status === 'waiting') {
        await tx.update(rooms).set({ status: 'playing' }).where(eq(rooms.id, roomId))
      }

      return ok({ roundId: round.id, seq: round.seq })
    })
  } catch (error) {
    console.error('startRound failed:', error)
    return fail('판 시작에 실패했습니다')
  }
}

const endRoundSchema = z.object({
  roomId: z.string().uuid(),
  winnerId: z.string().uuid(),
  note: z.string().trim().max(60).optional(),
})

export async function endRound(
  input: z.infer<typeof endRoundSchema>,
): Promise<ActionResult<{ seq: number; pot: number; winnerId: string }>> {
  const userId = await currentUserId()
  if (!userId) return fail('로그인이 필요합니다')

  const parsed = endRoundSchema.safeParse(input)
  if (!parsed.success) return fail('입력값이 올바르지 않습니다')
  const { roomId, winnerId, note } = parsed.data

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)
      if (!(await requireRole(tx, roomId, userId, ['host', 'dealer']))) {
        return fail('딜러 또는 방장만 판을 끝낼 수 있습니다')
      }

      const [round] = await tx
        .select()
        .from(rounds)
        .where(and(eq(rounds.roomId, roomId), eq(rounds.status, 'playing')))
        .orderBy(desc(rounds.seq))
        .limit(1)
      if (!round) return fail('진행 중인 판이 없습니다')

      const [winner] = await tx
        .select({ userId: roomMembers.userId })
        .from(roomMembers)
        .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, winnerId)))
        .limit(1)
      if (!winner) return fail('승자는 방 참가자여야 합니다')

      // 승인 대기 중인 액션이 남아 있으면 팟이 확정되지 않는다.
      const [pending] = await tx
        .select({ id: schema.betActions.id })
        .from(schema.betActions)
        .where(and(eq(schema.betActions.roundId, round.id), eq(schema.betActions.status, 'pending')))
        .limit(1)
      if (pending) return fail('승인 대기 중인 베팅을 먼저 처리하세요')

      const pot = await getRoundPot(round.id)
      if (pot > 0) {
        await tx.insert(chipLedger).values({
          roomId,
          roundId: round.id,
          userId: winnerId,
          delta: pot,
          reason: 'pot_win',
        })
      }

      await tx
        .update(rounds)
        .set({
          status: 'ended',
          pot,
          winnerId,
          result: note ? { note } : null,
          endedAt: new Date(),
        })
        .where(eq(rounds.id, round.id))

      return ok({ seq: round.seq, pot, winnerId })
    })
  } catch (error) {
    console.error('endRound failed:', error)
    return fail('판 종료에 실패했습니다')
  }
}

const voidRoundSchema = z.object({
  roomId: z.string().uuid(),
  reason: z.string().trim().min(1).max(60),
})

/** 판 무효(재경기 등) — 이 판의 베팅을 전액 정정 행으로 되돌린다. */
export async function voidRound(
  input: z.infer<typeof voidRoundSchema>,
): Promise<ActionResult<{ seq: number }>> {
  const userId = await currentUserId()
  if (!userId) return fail('로그인이 필요합니다')

  const parsed = voidRoundSchema.safeParse(input)
  if (!parsed.success) return fail('입력값이 올바르지 않습니다')
  const { roomId, reason } = parsed.data

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)
      if (!(await requireRole(tx, roomId, userId, ['host', 'dealer']))) {
        return fail('딜러 또는 방장만 판을 무효화할 수 있습니다')
      }

      const [round] = await tx
        .select()
        .from(rounds)
        .where(and(eq(rounds.roomId, roomId), eq(rounds.status, 'playing')))
        .orderBy(desc(rounds.seq))
        .limit(1)
      if (!round) return fail('진행 중인 판이 없습니다')

      // 아직 정정되지 않은 베팅 행을 전부 반환한다.
      const betRows = await tx
        .select()
        .from(chipLedger)
        .where(and(eq(chipLedger.roundId, round.id), eq(chipLedger.reason, 'bet')))
      const corrected = new Set(
        (
          await tx
            .select({ revertedOf: chipLedger.revertedOf })
            .from(chipLedger)
            .where(and(eq(chipLedger.roundId, round.id), eq(chipLedger.reason, 'correction')))
        ).map((row) => row.revertedOf),
      )

      const refunds = betRows
        .filter((row) => !corrected.has(row.id))
        .map((row) => ({
          roomId,
          roundId: round.id,
          userId: row.userId,
          delta: -row.delta,
          reason: 'correction' as const,
          refActionId: row.refActionId,
          revertedOf: row.id,
        }))
      if (refunds.length > 0) await tx.insert(chipLedger).values(refunds)

      await tx
        .update(schema.betActions)
        .set({ status: 'reverted', reason })
        .where(
          and(
            eq(schema.betActions.roundId, round.id),
            inArray(schema.betActions.status, ['pending', 'accepted']),
          ),
        )

      await tx
        .update(rounds)
        .set({ status: 'voided', result: { note: reason }, endedAt: new Date() })
        .where(eq(rounds.id, round.id))

      return ok({ seq: round.seq })
    })
  } catch (error) {
    console.error('voidRound failed:', error)
    return fail('판 무효화에 실패했습니다')
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
