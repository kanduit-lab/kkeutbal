import { and, desc, eq } from 'drizzle-orm'
import { schema } from '@/lib/db'
import {
  FAIRNESS_ALGORITHM_VERSION,
  commitServerSeed,
  generateFairnessSeed,
} from '../fairness/protocol'
import { FAIRNESS_PUBLIC_RECEIPT_VERSION } from '../fairness/receipt'
import { encryptFairnessServerSeed } from '../fairness/seed-crypto'
import {
  fairDatabaseNow,
  loadFairRoundParticipants,
  revealPersistedFairRound,
  resolvePersistedFairSeotdaShowdown,
  type PersistedFairRound,
} from '../fairness/fair-round-service'
import { SEOTDA_RULES_STANDARD } from '../seotda/types'
import type { Tx } from './action-helpers'
import { readFairPlaySettings } from './fair-play-settings'
import type { RoomGameType } from './types'

const { roundFairness, roundFairnessParticipants } = schema

/**
 * 판(round)의 공정 딜(commit-reveal) 처리 — 시작(시드 커밋)·종료(쇼다운 판정)·무효화(abort/reveal)
 * 세 경로를 모은다. `round-actions.ts`의 진입점(startRound/endRound/voidRound)이 트랜잭션
 * 경계와 권한 검사를 갖고, 이 모듈은 그 안에서 호출되는 공정 딜 세부 로직만 담당한다 —
 * 순서·조건은 원본 그대로이며 새 판정 로직을 추가하지 않는다.
 */

type FairPlayRoom = { readonly gameType: RoomGameType; readonly rulePreset: unknown }

/**
 * `startRound`에서 라운드·참가자 행을 먼저 insert한 뒤 호출한다. 검증 딜(섯다 verified) 방이
 * 아니면 아무 것도 하지 않는다. `roundId`는 호출부가 `crypto.randomUUID()`로 미리 만든 값과
 * 같아야 한다(서버 시드 commitment가 이 id에 묶인다).
 */
export async function setUpFairRoundIfVerified(
  tx: Tx,
  room: FairPlayRoom,
  roundId: string,
  participants: readonly { userId: string }[],
): Promise<void> {
  const fairPlay = readFairPlaySettings(room.gameType, room.rulePreset)
  const verifiedSeotda = fairPlay.dealing === 'verified' && room.gameType === 'seotda'
  const fairSeed = verifiedSeotda ? generateFairnessSeed() : null
  const [serverSeedCommitment, serverSeedCiphertext] = fairSeed
    ? await Promise.all([
        commitServerSeed(roundId, fairSeed),
        Promise.resolve(encryptFairnessServerSeed(fairSeed)),
      ])
    : [null, null]
  const fairNow = verifiedSeotda ? await fairDatabaseNow(tx) : null
  const seedDeadline =
    verifiedSeotda && fairNow
      ? new Date(fairNow.getTime() + fairPlay.seedCollectionSeconds * 1_000)
      : null

  if (serverSeedCommitment && serverSeedCiphertext && seedDeadline) {
    await tx.insert(roundFairness).values({
      roundId,
      algorithmVersion: FAIRNESS_ALGORITHM_VERSION,
      receiptVersion: FAIRNESS_PUBLIC_RECEIPT_VERSION,
      serverSeedCiphertext,
      serverSeedCommitment,
      seedDeadline,
    })
    await tx.insert(roundFairnessParticipants).values(
      participants.map((participant, dealOrder) => ({
        roundId,
        userId: participant.userId,
        dealOrder,
      })),
    )
  }
}

export type FairRoundWinnerResolution =
  | { readonly ok: true; readonly winnerId: string }
  | {
      readonly ok: false
      readonly error: 'errors.fairnessDealNotReady' | 'errors.winnerNotEligible' | 'errors.fairnessReplayRequired'
    }

/**
 * `endRound`에서 이미 로드해둔 `fairRound`(sealed 단계 확인 전)를 넘겨받아 fold하지 않은
 * 참가자 목록으로 승자를 판정한다. 검증 딜이 아닌 방(`fairRound` 없음)은 이 함수를 부르지
 * 않는다 — 호출부가 그 분기를 유지한다.
 */
export async function resolveFairRoundWinner(
  tx: Tx,
  room: { readonly gameType: string },
  round: { readonly id: string },
  fairRound: PersistedFairRound,
  requestedWinnerId: string | undefined,
): Promise<FairRoundWinnerResolution> {
  if (room.gameType !== 'seotda' || fairRound.phase !== 'sealed') {
    return { ok: false, error: 'errors.fairnessDealNotReady' }
  }
  const fairParticipants = await loadFairRoundParticipants(tx, round.id)
  const acceptedActions = await tx
    .select({ userId: schema.betActions.userId, action: schema.betActions.action })
    .from(schema.betActions)
    .where(and(eq(schema.betActions.roundId, round.id), eq(schema.betActions.status, 'accepted')))
    .orderBy(desc(schema.betActions.seq))
  const lastActionByUser = new Map<string, (typeof acceptedActions)[number]['action']>()
  for (const action of acceptedActions) {
    if (!lastActionByUser.has(action.userId)) lastActionByUser.set(action.userId, action.action)
  }
  const contenderIds = new Set(
    fairParticipants
      .filter((participant) => lastActionByUser.get(participant.userId) !== 'fold')
      .map((participant) => participant.userId),
  )
  if (contenderIds.size === 0) return { ok: false, error: 'errors.winnerNotEligible' }

  let winnerId = requestedWinnerId
  if (contenderIds.size === 1) {
    winnerId = [...contenderIds][0]
  } else {
    const showdown = await resolvePersistedFairSeotdaShowdown(
      fairRound,
      fairParticipants,
      SEOTDA_RULES_STANDARD,
      contenderIds,
    )
    if (showdown.outcome.kind !== 'win') return { ok: false, error: 'errors.fairnessReplayRequired' }
    winnerId = showdown.participants[showdown.outcome.winnerIndex]?.userId
  }
  if (!winnerId) throw new Error('Verified Seotda winner index is invalid')

  return { ok: true, winnerId }
}

/**
 * `voidRound`의 마무리 단계 — 무효 처리되는 라운드에 공정 딜 상태가 있으면 단계에 맞춰
 * abort(시드 수집 중) 또는 append-only reveal(봉인 후)로 마감한다. 공정 딜이 아니었던
 * 라운드는 아무 것도 하지 않는다.
 */
export async function handleVoidRoundFairness(
  tx: Tx,
  roundId: string,
  reason: string,
  voidedBy: string,
): Promise<void> {
  const [fairRoundRow] = await tx
    .select()
    .from(roundFairness)
    .where(eq(roundFairness.roundId, roundId))
    .limit(1)
  const fairRound = fairRoundRow as PersistedFairRound | undefined
  if (fairRound?.phase === 'collecting_seeds') {
    await tx
      .update(roundFairness)
      .set({ phase: 'aborted', abortedAt: await fairDatabaseNow(tx), abortReason: reason })
      .where(and(eq(roundFairness.roundId, roundId), eq(roundFairness.phase, 'collecting_seeds')))
  } else if (fairRound?.phase === 'sealed') {
    const fairParticipants = await loadFairRoundParticipants(tx, roundId)
    await revealPersistedFairRound(tx, fairRound, fairParticipants, voidedBy, await fairDatabaseNow(tx))
  }
}
