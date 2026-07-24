'use server'

import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { db, schema } from '@/lib/db'
import { currentUserId } from '../auth/session'
import { getRoundPot } from './queries'
import { balanceInRoom, lockRoom, readPointValue, requireRole } from './action-helpers'
import type { RoundPenaltyView } from './types'

/** 판 진행 액션 — 시작·종료·무효. 방 수명주기는 actions.ts. */

const { rooms, roomMembers, rounds, roundParticipants, chipLedger } = schema

export async function startRound(
  roomId: string,
): Promise<ActionResult<{ roundId: string; seq: number }>> {
  const userId = await currentUserId()
  if (!userId) return fail('errors.loginRequired')

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)
      if (!(await requireRole(tx, roomId, userId, ['host', 'dealer']))) {
        return fail('errors.dealerOrHostOnlyStartRound')
      }

      const [room] = await tx.select().from(rooms).where(eq(rooms.id, roomId)).limit(1)
      if (!room) return fail('errors.roomNotFound')
      if (room.status === 'settled' || room.status === 'closed') return fail('errors.roomEnded')

      const participants = await tx
        .select({ userId: roomMembers.userId })
        .from(roomMembers)
        .where(
          and(
            eq(roomMembers.roomId, roomId),
            isNull(roomMembers.leftAt),
            ne(roomMembers.role, 'observer'),
          ),
        )
      if (participants.length < 2) return fail('errors.roundNeedsTwoPlayers')

      const [playing] = await tx
        .select({ id: rounds.id })
        .from(rounds)
        .where(and(eq(rounds.roomId, roomId), eq(rounds.status, 'playing')))
        .limit(1)
      if (playing) return fail('errors.roundAlreadyActive')

      const [maxSeq] = await tx
        .select({ max: sql<number>`coalesce(max(${rounds.seq}), 0)` })
        .from(rounds)
        .where(eq(rounds.roomId, roomId))
      const seq = (maxSeq?.max ?? 0) + 1

      const [round] = await tx
        .insert(rounds)
        .values({ roomId, seq })
        .returning({ id: rounds.id, seq: rounds.seq })
      if (!round) return fail('errors.createRoundFailed')
      await tx.insert(roundParticipants).values(
        participants.map((participant) => ({
          roundId: round.id,
          userId: participant.userId,
        })),
      )

      if (room.status === 'waiting') {
        await tx.update(rooms).set({ status: 'playing' }).where(eq(rooms.id, roomId))
      }

      return ok({ roundId: round.id, seq: round.seq })
    })
  } catch (error) {
    console.error('startRound failed:', error)
    return fail('errors.startRoundFailed')
  }
}

const loserPenaltySchema = z.object({
  userId: z.string().uuid(),
  /** 2 = 피박 또는 광박, 4 = 둘 다 */
  factor: z.union([z.literal(1), z.literal(2), z.literal(4)]),
})

const endRoundSchema = z.object({
  roomId: z.string().uuid(),
  winnerId: z.string().uuid(),
  note: z.string().trim().max(60).optional(),
  /** 고스톱 점수. 고스톱 방에서는 필수 — 점수 × 점당 칩을 패자 전원이 지불한다. */
  score: z.number().int().min(1).max(999).optional(),
  /**
   * 고스톱 패자별 박 배수. 목록에 없는 패자는 1배.
   * 흔들기·총통 같은 공통 배수는 딜러 UI가 score에 미리 곱해서 보낸다.
   */
  loserPenalties: z
    .array(loserPenaltySchema)
    .max(9)
    .refine(
      (penalties) => new Set(penalties.map((penalty) => penalty.userId)).size === penalties.length,
    )
    .optional(),
})

export async function endRound(
  input: z.infer<typeof endRoundSchema>,
): Promise<ActionResult<{ seq: number; pot: number; winnerId: string }>> {
  const userId = await currentUserId()
  if (!userId) return fail('errors.loginRequired')

  const parsed = endRoundSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')
  const { roomId, winnerId, note, score, loserPenalties } = parsed.data

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)
      if (!(await requireRole(tx, roomId, userId, ['host', 'dealer']))) {
        return fail('errors.dealerOrHostOnlyEndRound')
      }

      const [room] = await tx.select().from(rooms).where(eq(rooms.id, roomId)).limit(1)
      if (!room) return fail('errors.roomNotFound')
      const isGostop = room.gameType === 'gostop'
      if (isGostop && !score) return fail('errors.gostopScoreRequired')

      const [round] = await tx
        .select()
        .from(rounds)
        .where(and(eq(rounds.roomId, roomId), eq(rounds.status, 'playing')))
        .orderBy(desc(rounds.seq))
        .limit(1)
      if (!round) return fail('errors.noActiveRound')

      const [winner] = await tx
        .select({ userId: roundParticipants.userId })
        .from(roundParticipants)
        .innerJoin(
          roomMembers,
          and(
            eq(roomMembers.roomId, roomId),
            eq(roomMembers.userId, roundParticipants.userId),
          ),
        )
        .where(
          and(
            eq(roundParticipants.roundId, round.id),
            eq(roundParticipants.userId, winnerId),
            isNull(roomMembers.leftAt),
            ne(roomMembers.role, 'observer'),
          ),
        )
        .limit(1)
      if (!winner) return fail('errors.winnerNotEligible')

      if (!isGostop) {
        const [winnerLastAction] = await tx
          .select({ action: schema.betActions.action })
          .from(schema.betActions)
          .where(
            and(
              eq(schema.betActions.roundId, round.id),
              eq(schema.betActions.userId, winnerId),
              eq(schema.betActions.status, 'accepted'),
            ),
          )
          .orderBy(desc(schema.betActions.seq))
          .limit(1)
        if (winnerLastAction?.action === 'fold') return fail('errors.foldedPlayerCannotWin')
      }

      // 승인 대기 중인 액션이 남아 있으면 팟이 확정되지 않는다.
      const [pending] = await tx
        .select({ id: schema.betActions.id })
        .from(schema.betActions)
        .where(and(eq(schema.betActions.roundId, round.id), eq(schema.betActions.status, 'pending')))
        .limit(1)
      if (pending) return fail('errors.pendingBetsBeforeEnd')

      let pot = await getRoundPot(round.id)
      // 판 결과에 기록할 박 적용 내역 — factor>1 이면서 실제 패자인 항목만. 원장 계산과 무관한 표시용 데이터.
      let persistedPenalties: RoundPenaltyView[] = []

      if (isGostop && score) {
        // 점수 정산: 패자(관전 제외, 승자 제외) 전원이 점수 × 점당 칩 × 박 배수를 지불한다.
        // 잔액보다 크면 잔액 전부(올인)만 지불한다 — 원장 음수 금지 불변식 유지.
        const pointValue = readPointValue(room.rulePreset)

        const penalties = loserPenalties ?? []
        const losers = await tx
          .select({ userId: roundParticipants.userId })
          .from(roundParticipants)
          .where(
            and(
              eq(roundParticipants.roundId, round.id),
              ne(roundParticipants.userId, winnerId),
            ),
          )
        const loserIds = new Set(losers.map((loser) => loser.userId))
        if (penalties.some((penalty) => !loserIds.has(penalty.userId))) {
          return fail('errors.invalidLoserData')
        }
        const factorByLoser = new Map(
          penalties.map((penalty) => [penalty.userId, penalty.factor] as const),
        )

        let collected = 0
        for (const loser of losers) {
          const owed = score * pointValue * (factorByLoser.get(loser.userId) ?? 1)
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
        // 표시용 기록 — 실제 패자에게 적용된 박(factor>1)만 남긴다. 지급액이 올인으로 깎여도
        // "박이 적용됐다"는 사실 자체는 바뀌지 않으므로 owed/pay 와 무관하게 입력값 기준으로 남긴다.
        persistedPenalties = penalties.flatMap((penalty) => {
          if (penalty.factor === 1) return []
          return [{ userId: penalty.userId, factor: penalty.factor }]
        })
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

      const result =
        note || score || persistedPenalties.length > 0
          ? {
              ...(note ? { note } : {}),
              ...(score ? { score } : {}),
              ...(persistedPenalties.length > 0 ? { penalties: persistedPenalties } : {}),
            }
          : null

      await tx
        .update(rounds)
        .set({
          status: 'ended',
          pot,
          winnerId,
          result,
          endedAt: new Date(),
        })
        .where(eq(rounds.id, round.id))

      return ok({ seq: round.seq, pot, winnerId })
    })
  } catch (error) {
    console.error('endRound failed:', error)
    return fail('errors.endRoundFailed')
  }
}

const voidRoundSchema = z.object({
  roomId: z.string().uuid(),
  reason: z.string().trim().min(1).max(60),
})

/**
 * 판 무효(재경기·승자 오입력 등) — 이 판의 칩 이동을 전액 정정 행으로 되돌린다.
 * 진행 중인 판이 없으면 마지막으로 끝난 판을 되돌린다 (그 뒤에 새 판이 시작되지 않은 경우만).
 */
export async function voidRound(
  input: z.infer<typeof voidRoundSchema>,
): Promise<ActionResult<{ roundId: string; seq: number }>> {
  const userId = await currentUserId()
  if (!userId) return fail('errors.loginRequired')

  const parsed = voidRoundSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')
  const { roomId, reason } = parsed.data

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)
      if (!(await requireRole(tx, roomId, userId, ['host', 'dealer']))) {
        return fail('errors.dealerOrHostOnlyVoidRound')
      }

      const [playing] = await tx
        .select()
        .from(rounds)
        .where(and(eq(rounds.roomId, roomId), eq(rounds.status, 'playing')))
        .orderBy(desc(rounds.seq))
        .limit(1)

      let round = playing
      if (!round) {
        // 승자 오입력 복구 경로 — 방의 최신 판이 '끝난 판'일 때만 되돌린다.
        // seq 최댓값 기준이라 "그 뒤에 새 판이 시작된 판"은 자연히 제외된다.
        const [latest] = await tx
          .select()
          .from(rounds)
          .where(eq(rounds.roomId, roomId))
          .orderBy(desc(rounds.seq))
          .limit(1)
        if (!latest || latest.status !== 'ended') return fail('errors.noRoundToVoid')
        round = latest
      }

      // 아직 정정되지 않은 칩 이동(베팅·팟 지급·점수 정산)을 전부 반대 부호로 되돌린다.
      const moveRows = await tx
        .select()
        .from(chipLedger)
        .where(
          and(
            eq(chipLedger.roundId, round.id),
            inArray(chipLedger.reason, ['bet', 'pot_win', 'settlement']),
          ),
        )
      const corrected = new Set(
        (
          await tx
            .select({ revertedOf: chipLedger.revertedOf })
            .from(chipLedger)
            .where(and(eq(chipLedger.roundId, round.id), eq(chipLedger.reason, 'correction')))
        ).map((row) => row.revertedOf),
      )

      const refunds = moveRows
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

      // 승자에게서 팟을 회수하면 잔액이 음수가 될 수 있다 — 원장 음수 금지 불변식 보호.
      const giveBack = new Map<string, number>()
      for (const refund of refunds) {
        if (refund.delta < 0) {
          giveBack.set(refund.userId, (giveBack.get(refund.userId) ?? 0) + refund.delta)
        }
      }
      for (const [memberId, delta] of giveBack) {
        const balance = await balanceInRoom(tx, roomId, memberId)
        if (balance + delta < 0) {
          return fail('errors.refundExceedsBalance')
        }
      }

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

      return ok({ roundId: round.id, seq: round.seq })
    })
  } catch (error) {
    console.error('voidRound failed:', error)
    return fail('errors.voidRoundFailed')
  }
}
