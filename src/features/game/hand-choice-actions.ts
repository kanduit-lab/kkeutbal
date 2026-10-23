'use server'

import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { db, schema } from '@/lib/db'
import { currentUserId } from '../auth/session'
import { memberInfo } from '../betting/bet-queries'
import type { RoundEndedFromBet } from '../betting/bet-view'
import {
  fairDatabaseNow,
  loadFairRoundParticipants,
  loadHandChoices,
  reconstructSealedFairRound,
  type PersistedFairRound,
} from '../fairness/fair-round-service'
import { privateSeotdaHand } from '../fairness/verified-seotda'
import { chosenSeotdaPair, toThreeCardHand } from '../seotda/three-card'
import { lockRoom, readSeotdaCards, type Tx } from './action-helpers'
import { autoSettleRoundIfComplete } from './round-finalize'

const { rooms, rounds, roundFairness, roundHandChoices, betActions } = schema

const submitSchema = z.object({
  roomId: z.string().uuid(),
  roundId: z.string().uuid(),
  cardIds: z.array(z.string().min(1).max(20)).length(2),
})

type ChoiceResult = ActionResult<{ roundEnded?: RoundEndedFromBet }>

async function loadChoosingRound(tx: Tx, roomId: string) {
  const [room] = await tx.select().from(rooms).where(eq(rooms.id, roomId)).limit(1)
  if (!room || room.gameType !== 'seotda' || readSeotdaCards(room.rulePreset) !== 3) return null
  const [round] = await tx
    .select()
    .from(rounds)
    .where(and(eq(rounds.roomId, roomId), eq(rounds.status, 'playing')))
    .orderBy(desc(rounds.seq))
    .limit(1)
  if (!round || round.street !== 2 || !round.chooseDeadline) return null
  const [fairRound] = await tx
    .select()
    .from(roundFairness)
    .where(eq(roundFairness.roundId, round.id))
    .limit(1)
  if (!fairRound) return null
  return { room, round, fairRound: fairRound as PersistedFairRound }
}

/** 3장 섯다에서 승부에 쓸 두 장을 고른다. 한 번 고르면 바꿀 수 없다 */
export async function submitHandChoice(input: z.infer<typeof submitSchema>): Promise<ChoiceResult> {
  const userId = await currentUserId()
  if (!userId) return fail('errors.loginRequired')
  const parsed = submitSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')
  const { roomId, roundId, cardIds } = parsed.data

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)
      const member = await memberInfo(tx, roomId, userId)
      if (!member || member.leftAt) return fail('errors.notMember')

      const choosing = await loadChoosingRound(tx, roomId)
      if (!choosing || choosing.round.id !== roundId) return fail('errors.handChoiceClosed')
      const { room, round, fairRound } = choosing

      const now = await fairDatabaseNow(tx)
      if (now.getTime() >= (round.chooseDeadline?.getTime() ?? 0)) {
        const roundEnded = await autoSettleRoundIfComplete(tx, room, round, userId)
        return roundEnded ? ok({ roundEnded }) : fail('errors.handChoiceClosed')
      }

      const choices = await loadHandChoices(tx, round.id)
      if (choices.has(userId)) return fail('errors.handChoiceAlreadySubmitted')

      const [lastAction] = await tx
        .select({ action: betActions.action })
        .from(betActions)
        .where(
          and(
            eq(betActions.roundId, round.id),
            eq(betActions.userId, userId),
            eq(betActions.status, 'accepted'),
          ),
        )
        .orderBy(desc(betActions.seq))
        .limit(1)
      if (lastAction?.action === 'fold') return fail('errors.handChoiceNotContender')

      const participants = await loadFairRoundParticipants(tx, round.id)
      if (!participants.some((participant) => participant.userId === userId)) {
        return fail('errors.fairnessNotParticipant')
      }
      const deal = await reconstructSealedFairRound(fairRound, participants)
      const hand = toThreeCardHand(
        privateSeotdaHand(deal.shuffle.shuffledDeckIds, deal.participants, userId, 3),
      )
      if (!hand || !chosenSeotdaPair(hand, cardIds)) return fail('errors.handChoiceInvalid')

      await tx.insert(roundHandChoices).values({ roundId: round.id, userId, cardIds })
      const roundEnded = await autoSettleRoundIfComplete(tx, room, round, userId)
      return ok(roundEnded ? { roundEnded } : {})
    })
  } catch (error) {
    console.error('submitHandChoice failed:', error)
    return fail('errors.handChoiceFailed')
  }
}

/**
 * 선택 마감이 지난 판을 판정한다. 별도 스케줄러가 없어서 마감 시각에 방에 있는 클라이언트가
 * 부른다. 마감 전이거나 선택 단계가 아니면 아무것도 하지 않는다.
 */
export async function settleDueHandChoices(roomId: string): Promise<ChoiceResult> {
  const userId = await currentUserId()
  if (!userId) return fail('errors.loginRequired')
  if (!z.string().uuid().safeParse(roomId).success) return fail('errors.invalidInput')

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)
      const member = await memberInfo(tx, roomId, userId)
      if (!member || member.leftAt) return fail('errors.notMember')

      const choosing = await loadChoosingRound(tx, roomId)
      if (!choosing) return ok({})
      const roundEnded = await autoSettleRoundIfComplete(
        tx,
        choosing.room,
        choosing.round,
        userId,
      )
      return ok(roundEnded ? { roundEnded } : {})
    })
  } catch (error) {
    console.error('settleDueHandChoices failed:', error)
    return fail('errors.handChoiceFailed')
  }
}
