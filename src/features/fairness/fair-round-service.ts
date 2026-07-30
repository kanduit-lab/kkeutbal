import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import type { Tx } from '../game/action-helpers'
import { schema } from '@/lib/db'
import { decryptFairnessServerSeed } from './seed-crypto'
import { parsePublicFairnessReceipt, type PublicFairnessReceipt } from './receipt'
import {
  createVerifiedSeotdaDeal,
  fullVerifiedSeotdaReceipt,
  resolveVerifiedSeotdaShowdown,
  type VerifiedSeotdaDeal,
  type VerifiedSeotdaParticipant,
} from './verified-seotda'
import type { SeotdaRules } from '../seotda/types'

const { roundFairness, roundFairnessParticipants, roundFairnessReveals } = schema

export type PersistedFairRound = Pick<
  typeof roundFairness.$inferSelect,
  | 'roundId'
  | 'phase'
  | 'serverSeedCiphertext'
  | 'serverSeedCommitment'
  | 'seedDeadline'
  | 'shuffledDeckCommitment'
  | 'publicReceipt'
>

export type PersistedFairParticipant = Pick<
  typeof roundFairnessParticipants.$inferSelect,
  'userId' | 'dealOrder' | 'clientSeedHash' | 'seedSubmittedAt' | 'seedTimedOutAt'
>

/**
 * 공정 딜 상태 전이의 기준 시각. 서버 프로세스 시계가 아니라 DB 시계를 쓴다 — 시드 마감·봉인
 * 시각이 여러 인스턴스에서 일관돼야 하고, 영수증에 남는 시각도 같은 기준이어야 한다.
 *
 * `to_char(... at time zone 'utc')`로 포맷을 못 박는 이유: drizzle의 raw `execute`는 컬럼 타입
 * 정보가 없어 postgres-js가 값을 파싱하지 않고 **문자열 그대로** 돌려준다
 * (`'2026-07-30 09:25:15.752893+00'`). 그래서 이 함수의 `instanceof Date` 검사는 항상 실패했고,
 * 검증 딜 방은 판 시작 자체가 "판 시작에 실패했습니다"로 끝났다 — 기능 전체가 죽어 있었다.
 * 드라이버 매핑이나 엔진별 관대한 날짜 파싱에 기대지 않고 ISO 8601 UTC로 고정해 직접 파싱한다.
 */
export async function fairDatabaseNow(tx: Tx): Promise<Date> {
  const rows = await tx.execute(
    sql`select to_char(statement_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as now`,
  )
  const value = (rows as unknown as ReadonlyArray<{ now?: unknown }>)[0]?.now
  const parsed = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null
  if (!parsed || !Number.isFinite(parsed.getTime())) {
    throw new Error('Database clock is unavailable for fair round transition')
  }
  return parsed
}

export async function loadFairRoundParticipants(
  tx: Tx,
  roundId: string,
): Promise<PersistedFairParticipant[]> {
  return tx
    .select({
      userId: roundFairnessParticipants.userId,
      dealOrder: roundFairnessParticipants.dealOrder,
      clientSeedHash: roundFairnessParticipants.clientSeedHash,
      seedSubmittedAt: roundFairnessParticipants.seedSubmittedAt,
      seedTimedOutAt: roundFairnessParticipants.seedTimedOutAt,
    })
    .from(roundFairnessParticipants)
    .where(eq(roundFairnessParticipants.roundId, roundId))
    .orderBy(asc(roundFairnessParticipants.dealOrder))
}

export async function sealPersistedFairRound(
  tx: Tx,
  fairRound: PersistedFairRound,
  participants: readonly PersistedFairParticipant[],
  now: Date,
): Promise<VerifiedSeotdaDeal> {
  if (fairRound.phase !== 'collecting_seeds') throw new Error('Fair round is not collecting seeds')
  const allSubmitted = participants.every((participant) => participant.clientSeedHash !== null)
  if (!allSubmitted && now.getTime() < fairRound.seedDeadline.getTime()) {
    throw new Error('Fair round seed deadline has not been reached')
  }

  const serverSeed = decryptFairnessServerSeed(fairRound.serverSeedCiphertext)
  const deal = await createVerifiedSeotdaDeal({
    roundId: fairRound.roundId,
    serverSeed,
    participants: participantSnapshot(participants),
    clientSeedHashes: participants.flatMap((participant) =>
      participant.clientSeedHash
        ? [{ userId: participant.userId, seedHash: participant.clientSeedHash }]
        : [],
    ),
  })
  if (deal.shuffle.serverSeedCommitment !== fairRound.serverSeedCommitment) {
    throw new Error('Fair round server seed commitment does not match ciphertext')
  }

  await tx
    .update(roundFairnessParticipants)
    .set({ seedTimedOutAt: now })
    .where(
      and(
        eq(roundFairnessParticipants.roundId, fairRound.roundId),
        isNull(roundFairnessParticipants.clientSeedHash),
      ),
    )
  await tx
    .update(roundFairness)
    .set({
      phase: 'sealed',
      seedCollectionSealedAt: now,
      shuffledDeckCommitment: deal.shuffle.deckCommitment,
      publicReceipt: deal.publicReceipt,
    })
    .where(
      and(
        eq(roundFairness.roundId, fairRound.roundId),
        eq(roundFairness.phase, 'collecting_seeds'),
      ),
    )

  return deal
}

export async function reconstructSealedFairRound(
  fairRound: PersistedFairRound,
  participants: readonly PersistedFairParticipant[],
): Promise<VerifiedSeotdaDeal> {
  if (fairRound.phase !== 'sealed' && fairRound.phase !== 'revealed') {
    throw new Error('Fair round has not been sealed')
  }
  if (!fairRound.publicReceipt || !fairRound.shuffledDeckCommitment) {
    throw new Error('Sealed fair round is missing its public receipt')
  }

  const publicReceipt = parsePublicFairnessReceipt(fairRound.publicReceipt)
  const serverSeed = decryptFairnessServerSeed(fairRound.serverSeedCiphertext)
  const deal = await createVerifiedSeotdaDeal({
    roundId: fairRound.roundId,
    serverSeed,
    participants: participantSnapshot(participants),
    clientSeedHashes: participants.flatMap((participant) =>
      participant.clientSeedHash
        ? [{ userId: participant.userId, seedHash: participant.clientSeedHash }]
        : [],
    ),
  })
  if (
    deal.shuffle.serverSeedCommitment !== fairRound.serverSeedCommitment ||
    deal.shuffle.deckCommitment !== fairRound.shuffledDeckCommitment ||
    !samePublicReceipt(deal.publicReceipt, publicReceipt)
  ) {
    throw new Error('Fair round receipt does not match its sealed server state')
  }
  return deal
}

export async function revealPersistedFairRound(
  tx: Tx,
  fairRound: PersistedFairRound | undefined,
  participants: readonly PersistedFairParticipant[],
  revealedBy: string,
  now: Date,
): Promise<void> {
  if (!fairRound || fairRound.phase === 'aborted' || fairRound.phase === 'revealed') return
  if (fairRound.phase !== 'sealed') throw new Error('Cannot reveal an unsealed fair round')

  const [existing] = await tx
    .select({ roundId: roundFairnessReveals.roundId })
    .from(roundFairnessReveals)
    .where(eq(roundFairnessReveals.roundId, fairRound.roundId))
    .limit(1)
  if (existing) throw new Error('Fair round reveal phase is inconsistent')

  const [deal, serverSeed] = await Promise.all([
    reconstructSealedFairRound(fairRound, participants),
    Promise.resolve(decryptFairnessServerSeed(fairRound.serverSeedCiphertext)),
  ])
  await tx.insert(roundFairnessReveals).values({
    roundId: fairRound.roundId,
    serverSeed,
    fullReceipt: fullVerifiedSeotdaReceipt(deal, serverSeed),
    revealedBy,
  })
  await tx
    .update(roundFairness)
    .set({ phase: 'revealed', revealedAt: now })
    .where(and(eq(roundFairness.roundId, fairRound.roundId), eq(roundFairness.phase, 'sealed')))
}

export async function resolvePersistedFairSeotdaShowdown(
  fairRound: PersistedFairRound,
  participants: readonly PersistedFairParticipant[],
  rules: SeotdaRules,
  eligibleUserIds: ReadonlySet<string>,
) {
  const deal = await reconstructSealedFairRound(fairRound, participants)
  return resolveVerifiedSeotdaShowdown(
    deal.shuffle.shuffledDeckIds,
    deal.participants,
    rules,
    eligibleUserIds,
  )
}

function participantSnapshot(
  participants: readonly PersistedFairParticipant[],
): readonly VerifiedSeotdaParticipant[] {
  return participants.map((participant) => ({
    userId: participant.userId,
    dealOrder: participant.dealOrder,
  }))
}

function samePublicReceipt(left: PublicFairnessReceipt, right: PublicFairnessReceipt): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}