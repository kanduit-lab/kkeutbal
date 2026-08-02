import { and, asc, eq } from 'drizzle-orm'
import { schema } from '@/lib/db'
import {
  fairDatabaseNow,
  loadFairRoundParticipants,
  revealPersistedFairRound,
  resolvePersistedFairSeotdaShowdown,
  type PersistedFairRound,
} from '../fairness/fair-round-service'
import { SEOTDA_RULES_STANDARD } from '../seotda/types'
import { computeRoundCompletion } from '../betting/round-completion'
import { activeRoundParticipantIds, type Tx } from './action-helpers'
import { getRoundPot } from './queries'

const { rounds, chipLedger, roundFairness, betActions } = schema
type RoomRow = typeof schema.rooms.$inferSelect

/** 팟을 승자에게 지급한다(고스톱 점수 정산이 아닌 단순 팟 승리 경로). `pot <= 0`이면 아무것도 안 한다. */
export async function creditPotToWinner(
  tx: Tx,
  room: { id: string },
  round: { id: string },
  winnerId: string,
  pot: number,
): Promise<void> {
  if (pot <= 0) return
  await tx.insert(chipLedger).values({
    roomId: room.id,
    roundId: round.id,
    userId: winnerId,
    delta: pot,
    reason: 'pot_win',
  })
}

/**
 * 판을 `ended`로 확정 기록한다 — 정산(팟 지급) 자체는 호출부가 먼저 끝내둔다.
 *
 * `status = 'playing'` 조건을 UPDATE 자체에 건다. 지금은 모든 호출부가 방 advisory lock을
 * 잡은 뒤 상태를 다시 읽으므로 이 조건이 없어도 맞지만, lock을 빠뜨린 새 정산 경로가
 * 생기면 이미 끝난 판의 승자와 판돈을 조용히 덮어쓰게 된다. 0행이면 이미 누군가
 * 끝낸 판이므로 트랜잭션 전체를 되돌린다 — 팟은 이 시점에 이미 지급돼 있어서
 * 그냥 넘어가면 중복 지급이 된다.
 */
export async function finalizeRoundRecord(
  tx: Tx,
  round: { id: string },
  winnerId: string,
  pot: number,
  result: unknown,
): Promise<void> {
  const settled = await tx
    .update(rounds)
    .set({ status: 'ended', pot, winnerId, result, endedAt: new Date() })
    .where(and(eq(rounds.id, round.id), eq(rounds.status, 'playing')))
    .returning({ id: rounds.id })
  if (settled.length === 0) throw new Error('Round was already finalized')
}

/** 공정 딜 라운드면 공개 리빌을 진행한다. 공정 딜이 아니면 아무것도 안 한다. */
export async function revealFairnessIfNeeded(
  tx: Tx,
  fairRound: PersistedFairRound | undefined,
  revealedBy: string,
): Promise<void> {
  if (!fairRound) return
  const fairParticipants = await loadFairRoundParticipants(tx, fairRound.roundId)
  await revealPersistedFairRound(tx, fairRound, fairParticipants, revealedBy, await fairDatabaseNow(tx))
}

/**
 * 판 자동 종료 — `betting/actions.ts`의 `placeBet`/`approveBet`가 베팅 액션을 accept한 직후,
 * 같은 트랜잭션 안에서 호출한다(딜러가 "🏁 종료"를 누르지 않아도 되게 하는 경로,
 * `docs/12-handoff.md` 9번).
 *
 * 고스톱은 베팅이 없으므로(placeBet 자체가 거부) 대상에서 제외한다.
 *
 * - fold하지 않은 참가자가 1명 남으면(`single_survivor`) 카드 판정 없이 그 사람을 승자로 확정
 *   한다 — 검증 딜(공정 딜) 방이면 `endRound`와 동일하게 시드 봉인(`sealed`)까지 끝나야 자동
 *   종료한다(카드를 아직 결정할 수 없는 상태에서 승자를 확정할 수 없다).
 * - 콜이 다 맞아 쇼다운 단계(`showdown_ready`)가 됐고 검증 딜이 봉인까지 끝났으면, 이미
 *   `endRound`가 쓰는 것과 같은 카드 재구성 경로(`resolvePersistedFairSeotdaShowdown`)로 승자를
 *   자동 판정한다 — 새 판정 로직을 추가하는 게 아니라 기존 "딜러가 종료를 누르면 벌어지는 일"을
 *   그대로 재사용할 뿐이다. 검증 딜이 아닌 방(카드를 서버가 모름)은 `showdown_ready`에서 승자를
 *   정하지 않는다 — 딜러가 카드를 보고 확정해야 한다(`dealer-panel-controls.ts`가 폼을 자동으로
 *   연다).
 * - 승인 대기 중인 베팅이 남아 있으면 `endRound`와 같은 이유로 자동 종료를 미룬다.
 *
 * 조건이 안 맞으면(아직 진행 중, 대기 베팅 존재, 공정 딜 미봉인, 동점/구사 등) `null`을 반환하고
 * 호출부는 아무 일도 없었던 것처럼 계속 진행한다 — 딜러의 수동 종료 경로(`endRound`)는 그대로
 * 남아 있다.
 */
export async function autoSettleRoundIfComplete(
  tx: Tx,
  room: RoomRow,
  round: { id: string; seq: number },
  triggeredBy: string,
): Promise<{ seq: number; pot: number; winnerId: string } | null> {
  if (room.gameType === 'gostop') return null

  const [fairRoundRow] = await tx
    .select()
    .from(roundFairness)
    .where(eq(roundFairness.roundId, round.id))
    .limit(1)
  const fairRound = fairRoundRow as PersistedFairRound | undefined

  const participantIds = await activeRoundParticipantIds(tx, room.id, round.id)
  const acceptedActions = await tx
    .select({
      userId: betActions.userId,
      action: betActions.action,
      amount: betActions.amount,
      status: betActions.status,
    })
    .from(betActions)
    .where(and(eq(betActions.roundId, round.id), eq(betActions.status, 'accepted')))
    .orderBy(asc(betActions.seq))

  const completion = computeRoundCompletion(participantIds, acceptedActions)
  if (completion.kind === 'active') return null

  let winnerId: string
  if (fairRound) {
    if (room.gameType !== 'seotda' || fairRound.phase !== 'sealed') return null
    if (completion.kind === 'single_survivor') {
      winnerId = completion.winnerId
    } else {
      const fairParticipants = await loadFairRoundParticipants(tx, round.id)
      const showdown = await resolvePersistedFairSeotdaShowdown(
        fairRound,
        fairParticipants,
        SEOTDA_RULES_STANDARD,
        new Set(completion.contenderIds),
      )
      if (showdown.outcome.kind !== 'win') return null
      const resolvedWinnerId = showdown.participants[showdown.outcome.winnerIndex]?.userId
      if (!resolvedWinnerId) return null
      winnerId = resolvedWinnerId
    }
  } else {
    if (completion.kind !== 'single_survivor') return null
    winnerId = completion.winnerId
  }

  const [anyPending] = await tx
    .select({ id: betActions.id })
    .from(betActions)
    .where(and(eq(betActions.roundId, round.id), eq(betActions.status, 'pending')))
    .limit(1)
  if (anyPending) return null

  // `tx`를 넘겨야 한다. 이 경로는 `placeBet`/`approveBet`가 방금 INSERT한 베팅 행과 같은
  // 트랜잭션 안이라, 풀 커넥션으로 읽으면 그 행이 안 보여 판돈이 그만큼 비어 버린다.
  const pot = await getRoundPot(round.id, tx)
  await creditPotToWinner(tx, room, round, winnerId, pot)
  await finalizeRoundRecord(tx, round, winnerId, pot, null)
  await revealFairnessIfNeeded(tx, fairRound, triggeredBy)
  return { seq: round.seq, pot, winnerId }
}
