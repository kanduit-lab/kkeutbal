'use server'

import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { db, schema } from '@/lib/db'
import { currentUserId } from '../auth/session'
import { getRoundPot } from './queries'
import { balanceInRoom, lockRoom, readPointValue, requireRole } from './action-helpers'

/** 판 진행 액션 — 시작·종료·무효. 방 수명주기는 actions.ts. */

const { rooms, roomMembers, rounds, chipLedger } = schema

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
  /** 고스톱 점수. 고스톱 방에서는 필수 — 점수 × 점당 칩을 패자 전원이 지불한다. */
  score: z.number().int().min(1).max(999).optional(),
})

export async function endRound(
  input: z.infer<typeof endRoundSchema>,
): Promise<ActionResult<{ seq: number; pot: number; winnerId: string }>> {
  const userId = await currentUserId()
  if (!userId) return fail('로그인이 필요합니다')

  const parsed = endRoundSchema.safeParse(input)
  if (!parsed.success) return fail('입력값이 올바르지 않습니다')
  const { roomId, winnerId, note, score } = parsed.data

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)
      if (!(await requireRole(tx, roomId, userId, ['host', 'dealer']))) {
        return fail('딜러 또는 방장만 판을 끝낼 수 있습니다')
      }

      const [room] = await tx.select().from(rooms).where(eq(rooms.id, roomId)).limit(1)
      if (!room) return fail('방을 찾을 수 없습니다')
      const isGostop = room.gameType === 'gostop'
      if (isGostop && !score) return fail('고스톱은 점수를 입력해야 합니다')

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

      let pot = await getRoundPot(round.id)

      if (isGostop && score) {
        // 점수 정산: 패자(관전 제외, 승자 제외) 전원이 점수 × 점당 칩을 지불한다.
        // 잔액보다 크면 잔액 전부(올인)만 지불한다 — 원장 음수 금지 불변식 유지.
        const pointValue = readPointValue(room.rulePreset)
        const owed = score * pointValue

        const losers = await tx
          .select({ userId: roomMembers.userId })
          .from(roomMembers)
          .where(
            and(
              eq(roomMembers.roomId, roomId),
              sql`${roomMembers.leftAt} is null`,
              sql`${roomMembers.role} <> 'observer'`,
              sql`${roomMembers.userId} <> ${winnerId}`,
            ),
          )

        let collected = 0
        for (const loser of losers) {
          const balance = await balanceInRoom(tx, roomId, loser.userId)
          const pay = Math.min(balance, owed)
          if (pay <= 0) continue
          collected += pay
          await tx.insert(chipLedger).values({
            roomId,
            roundId: round.id,
            userId: loser.userId,
            delta: -pay,
            reason: 'settlement',
          })
        }
        if (collected > 0) {
          await tx.insert(chipLedger).values({
            roomId,
            roundId: round.id,
            userId: winnerId,
            delta: collected,
            reason: 'pot_win',
          })
        }
        pot += collected
      } else if (pot > 0) {
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
          result: note || score ? { ...(note ? { note } : {}), ...(score ? { score } : {}) } : null,
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
