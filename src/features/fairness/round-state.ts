import { SEOTDA_DECK } from '../hwatu/cards'
import { FAIRNESS_PUBLIC_RECEIPT_VERSION, type PublicFairnessReceipt } from './receipt'
import { FAIRNESS_ALGORITHM_VERSION } from './protocol'

/** `round_fairness` 행의 순수 도메인 표현 버전. DB 레코드 해석을 변경할 때 올린다. */
export const FAIR_ROUND_STATE_VERSION = 1 as const

/** 공정 딜의 단방향 수명주기. `aborted`는 seed 공개 전 취소만 표현한다. */
export type FairRoundPhase = 'collecting_seeds' | 'sealed' | 'revealed' | 'aborted'

export interface FairRoundParticipantState {
  readonly userId: string
  /** 판 시작 때 고정한 딜 순서. 현재 방 좌석을 나중에 다시 읽지 않는다. */
  readonly dealOrder: number
  /** 원문 seed가 아니라 round/user에 바인딩된 SHA-256 hash만 보관한다. */
  readonly clientSeedHash: string | null
  readonly seedSubmittedAt: Date | null
  /** deadline 후 미제출자를 seal 시점에 확정한다. */
  readonly seedTimedOutAt: Date | null
}

/** 서버 seed 암호문과 종료 뒤 평문 reveal은 DB service 경계에만 남기고, 순수 상태에는 넣지 않는다. */
export interface FairRoundState {
  readonly stateVersion: typeof FAIR_ROUND_STATE_VERSION
  readonly roundId: string
  readonly game: 'seotda'
  readonly algorithmVersion: typeof FAIRNESS_ALGORITHM_VERSION
  readonly receiptVersion: typeof FAIRNESS_PUBLIC_RECEIPT_VERSION
  readonly phase: FairRoundPhase
  readonly serverSeedCommitment: string
  readonly seedDeadline: Date
  readonly seedCollectionSealedAt: Date | null
  readonly shuffledDeckCommitment: string | null
  /** broadcast 가능한 엄격한 public receipt. private cards·seed는 포함하지 않는다. */
  readonly publicReceipt: PublicFairnessReceipt | null
  readonly revealedAt: Date | null
  readonly abortedAt: Date | null
  readonly abortReason: string | null
  readonly participants: readonly FairRoundParticipantState[]
}

export interface CreateFairRoundStateInput {
  readonly roundId: string
  readonly serverSeedCommitment: string
  readonly seedDeadline: Date
  readonly now: Date
  readonly participants: readonly Pick<FairRoundParticipantState, 'userId' | 'dealOrder'>[]
}

export interface SubmitFairRoundSeedInput {
  readonly userId: string
  readonly clientSeedHash: string
  readonly now: Date
}

export interface SealFairRoundInput {
  readonly now: Date
  /** 서버가 실제 셔플을 계산한 뒤 만들고 strict parser를 통과시킨 안전한 영수증. */
  readonly publicReceipt: PublicFairnessReceipt
}

export interface RevealFairRoundInput {
  readonly now: Date
  /** rounds.status가 ended/voided인지를 DB transaction에서 읽어 전달한다. */
  readonly roundFinalized: boolean
}

export type FairRoundStateErrorCode =
  | 'FAIR_ROUND_INVALID_INPUT'
  | 'FAIR_ROUND_NOT_PARTICIPANT'
  | 'FAIR_ROUND_NOT_COLLECTING'
  | 'FAIR_ROUND_SEED_DEADLINE_REACHED'
  | 'FAIR_ROUND_SEED_CONFLICT'
  | 'FAIR_ROUND_SEED_DEADLINE_NOT_REACHED'
  | 'FAIR_ROUND_INVALID_RECEIPT'
  | 'FAIR_ROUND_NOT_SEALED'
  | 'FAIR_ROUND_NOT_FINALIZED'

/** 호출자가 사용자에게 노출할 오류 키로 변환하기 쉬운 안정적인 도메인 오류. */
export class FairRoundStateError extends Error {
  constructor(readonly code: FairRoundStateErrorCode) {
    super(code)
    this.name = 'FairRoundStateError'
  }
}

const HASH_PATTERN = /^[0-9a-f]{64}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_SEOTDA_PARTICIPANTS = SEOTDA_DECK.length / 2

/** commitment가 공개된 뒤 시작하는 seed collection 상태를 만든다. */
export function createFairRoundState(input: CreateFairRoundStateInput): FairRoundState {
  assertUuid(input.roundId)
  assertHash(input.serverSeedCommitment)
  assertValidDate(input.now)
  assertValidDate(input.seedDeadline)
  if (input.seedDeadline.getTime() <= input.now.getTime()) fail('FAIR_ROUND_INVALID_INPUT')

  const participants = [...input.participants].map((participant) => {
    assertUuid(participant.userId)
    if (!Number.isInteger(participant.dealOrder) || participant.dealOrder < 0) {
      fail('FAIR_ROUND_INVALID_INPUT')
    }
    return {
      userId: participant.userId,
      dealOrder: participant.dealOrder,
      clientSeedHash: null,
      seedSubmittedAt: null,
      seedTimedOutAt: null,
    } satisfies FairRoundParticipantState
  })
  assertDealParticipants(participants)

  return freezeState({
    stateVersion: FAIR_ROUND_STATE_VERSION,
    roundId: input.roundId,
    game: 'seotda',
    algorithmVersion: FAIRNESS_ALGORITHM_VERSION,
    receiptVersion: FAIRNESS_PUBLIC_RECEIPT_VERSION,
    phase: 'collecting_seeds',
    serverSeedCommitment: input.serverSeedCommitment,
    seedDeadline: copyDate(input.seedDeadline),
    seedCollectionSealedAt: null,
    shuffledDeckCommitment: null,
    publicReceipt: null,
    revealedAt: null,
    abortedAt: null,
    abortReason: null,
    participants,
  })
}

/**
 * 참가자별 commitment 제출. 같은 hash 재전송은 시각과 phase가 바뀌어도 no-op으로 수렴하고,
 * 다른 hash로 바꾸려는 시도는 거부한다.
 */
export function submitFairRoundSeed(
  state: FairRoundState,
  input: SubmitFairRoundSeedInput,
): FairRoundState {
  assertUuid(input.userId)
  assertHash(input.clientSeedHash)
  assertValidDate(input.now)

  const participant = state.participants.find((entry) => entry.userId === input.userId)
  if (!participant) fail('FAIR_ROUND_NOT_PARTICIPANT')
  if (participant.clientSeedHash === input.clientSeedHash) return state
  if (participant.clientSeedHash !== null) fail('FAIR_ROUND_SEED_CONFLICT')
  if (state.phase !== 'collecting_seeds') fail('FAIR_ROUND_NOT_COLLECTING')
  if (input.now.getTime() >= state.seedDeadline.getTime()) {
    fail('FAIR_ROUND_SEED_DEADLINE_REACHED')
  }

  return freezeState({
    ...state,
    participants: state.participants.map((entry) =>
      entry.userId === input.userId
        ? { ...entry, clientSeedHash: input.clientSeedHash, seedSubmittedAt: copyDate(input.now) }
        : entry,
    ),
  })
}

/**
 * 전원 제출 또는 DB 기준 deadline 도달 뒤 셔플 결과를 영수증으로 봉인한다. deadline으로 진행될 때
 * 미제출자는 `seedTimedOutAt`에 명시적으로 남긴다. 이 함수는 카드·seed 원문을 받지 않는다.
 */
export function sealFairRound(state: FairRoundState, input: SealFairRoundInput): FairRoundState {
  assertValidDate(input.now)
  if (state.phase !== 'collecting_seeds') fail('FAIR_ROUND_NOT_COLLECTING')

  const allSubmitted = state.participants.every((participant) => participant.clientSeedHash !== null)
  if (!allSubmitted && input.now.getTime() < state.seedDeadline.getTime()) {
    fail('FAIR_ROUND_SEED_DEADLINE_NOT_REACHED')
  }
  assertReceiptMatchesState(state, input.publicReceipt)

  return freezeState({
    ...state,
    phase: 'sealed',
    seedCollectionSealedAt: copyDate(input.now),
    shuffledDeckCommitment: input.publicReceipt.shuffledDeckCommitment,
    publicReceipt: cloneReceipt(input.publicReceipt),
    participants: state.participants.map((participant) =>
      participant.clientSeedHash === null
        ? { ...participant, seedTimedOutAt: copyDate(input.now) }
        : participant,
    ),
  })
}

/** 종료된 판에서만 full receipt/server seed reveal 레코드를 만들 수 있게 상태를 전이한다. */
export function revealFairRound(
  state: FairRoundState,
  input: RevealFairRoundInput,
): FairRoundState {
  assertValidDate(input.now)
  if (state.phase !== 'sealed') fail('FAIR_ROUND_NOT_SEALED')
  if (!input.roundFinalized) fail('FAIR_ROUND_NOT_FINALIZED')

  return freezeState({ ...state, phase: 'revealed', revealedAt: copyDate(input.now) })
}

/** seed 공개 전 취소. 이미 봉인한 딜은 별도 void/reveal 감사 경로로만 종료한다. */
export function abortFairRound(state: FairRoundState, now: Date, reason: string): FairRoundState {
  assertValidDate(now)
  if (state.phase !== 'collecting_seeds') fail('FAIR_ROUND_NOT_COLLECTING')
  const normalizedReason = reason.trim()
  if (normalizedReason.length === 0 || normalizedReason.length > 200) {
    fail('FAIR_ROUND_INVALID_INPUT')
  }

  return freezeState({
    ...state,
    phase: 'aborted',
    abortedAt: copyDate(now),
    abortReason: normalizedReason,
  })
}

function assertReceiptMatchesState(state: FairRoundState, receipt: PublicFairnessReceipt): void {
  if (
    receipt.roundId !== state.roundId ||
    receipt.game !== state.game ||
    receipt.algorithmVersion !== state.algorithmVersion ||
    receipt.receiptVersion !== state.receiptVersion ||
    receipt.seedAudit.serverSeedCommitment !== state.serverSeedCommitment ||
    receipt.shuffledDeckCommitment.length !== 64 ||
    !HASH_PATTERN.test(receipt.shuffledDeckCommitment)
  ) {
    fail('FAIR_ROUND_INVALID_RECEIPT')
  }

  const submittedHashes = new Map(
    state.participants.flatMap((participant) =>
      participant.clientSeedHash === null
        ? []
        : [[participant.userId, participant.clientSeedHash] as const],
    ),
  )
  const receiptHashes = new Map(
    receipt.seedAudit.clientSeedHashes.map((entry) => [entry.userId, entry.seedHash] as const),
  )
  if (receiptHashes.size !== receipt.seedAudit.clientSeedHashes.length) {
    fail('FAIR_ROUND_INVALID_RECEIPT')
  }
  if (submittedHashes.size !== receiptHashes.size) fail('FAIR_ROUND_INVALID_RECEIPT')
  for (const [userId, hash] of submittedHashes) {
    if (receiptHashes.get(userId) !== hash) fail('FAIR_ROUND_INVALID_RECEIPT')
  }
}

function assertDealParticipants(participants: readonly FairRoundParticipantState[]): void {
  if (participants.length < 2 || participants.length > MAX_SEOTDA_PARTICIPANTS) {
    fail('FAIR_ROUND_INVALID_INPUT')
  }
  const userIds = new Set(participants.map((participant) => participant.userId))
  const orders = new Set(participants.map((participant) => participant.dealOrder))
  if (userIds.size !== participants.length || orders.size !== participants.length) {
    fail('FAIR_ROUND_INVALID_INPUT')
  }
  for (let order = 0; order < participants.length; order += 1) {
    if (!orders.has(order)) fail('FAIR_ROUND_INVALID_INPUT')
  }
}

function freezeState(state: FairRoundState): FairRoundState {
  return Object.freeze({
    ...state,
    seedDeadline: copyDate(state.seedDeadline),
    seedCollectionSealedAt: copyNullableDate(state.seedCollectionSealedAt),
    publicReceipt: state.publicReceipt ? cloneReceipt(state.publicReceipt) : null,
    revealedAt: copyNullableDate(state.revealedAt),
    abortedAt: copyNullableDate(state.abortedAt),
    participants: Object.freeze(
      state.participants.map((participant) =>
        Object.freeze({
          ...participant,
          seedSubmittedAt: copyNullableDate(participant.seedSubmittedAt),
          seedTimedOutAt: copyNullableDate(participant.seedTimedOutAt),
        }),
      ),
    ),
  })
}

function cloneReceipt(receipt: PublicFairnessReceipt): PublicFairnessReceipt {
  return Object.freeze({
    ...receipt,
    seedAudit: Object.freeze({
      ...receipt.seedAudit,
      clientSeedHashes: Object.freeze(
        receipt.seedAudit.clientSeedHashes.map((entry) => Object.freeze({ ...entry })),
      ),
    }),
    dealPlan: Object.freeze({
      ...receipt.dealPlan,
      publicBoardStages: Object.freeze([...receipt.dealPlan.publicBoardStages]),
    }),
  })
}

function assertUuid(value: string): void {
  if (!UUID_PATTERN.test(value)) fail('FAIR_ROUND_INVALID_INPUT')
}

function assertHash(value: string): void {
  if (!HASH_PATTERN.test(value)) fail('FAIR_ROUND_INVALID_INPUT')
}

function assertValidDate(value: Date): void {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail('FAIR_ROUND_INVALID_INPUT')
}

function copyDate(value: Date): Date {
  return new Date(value.getTime())
}

function copyNullableDate(value: Date | null): Date | null {
  return value ? copyDate(value) : null
}

function fail(code: FairRoundStateErrorCode): never {
  throw new FairRoundStateError(code)
}
