import { SEOTDA_DECK } from '../hwatu/cards'
import { FAIRNESS_PUBLIC_RECEIPT_VERSION, type PublicFairnessReceipt } from './receipt'
import { FAIRNESS_ALGORITHM_VERSION } from './protocol'

export const FAIR_ROUND_STATE_VERSION = 1 as const

export type FairRoundPhase = 'collecting_seeds' | 'sealed' | 'revealed' | 'aborted'

export interface FairRoundParticipantState {
  readonly userId: string

  readonly dealOrder: number

  readonly clientSeedHash: string | null
  readonly seedSubmittedAt: Date | null

  readonly seedTimedOutAt: Date | null
}

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

  readonly publicReceipt: PublicFairnessReceipt
}

export interface RevealFairRoundInput {
  readonly now: Date

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

export class FairRoundStateError extends Error {
  constructor(readonly code: FairRoundStateErrorCode) {
    super(code)
    this.name = 'FairRoundStateError'
  }
}

const HASH_PATTERN = /^[0-9a-f]{64}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_SEOTDA_PARTICIPANTS = SEOTDA_DECK.length / 2

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

export function sealFairRound(state: FairRoundState, input: SealFairRoundInput): FairRoundState {
  assertValidDate(input.now)
  if (state.phase !== 'collecting_seeds') fail('FAIR_ROUND_NOT_COLLECTING')

  const allSubmitted = state.participants.every(
    (participant) => participant.clientSeedHash !== null,
  )
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

export function revealFairRound(
  state: FairRoundState,
  input: RevealFairRoundInput,
): FairRoundState {
  assertValidDate(input.now)
  if (state.phase !== 'sealed') fail('FAIR_ROUND_NOT_SEALED')
  if (!input.roundFinalized) fail('FAIR_ROUND_NOT_FINALIZED')

  return freezeState({ ...state, phase: 'revealed', revealedAt: copyDate(input.now) })
}

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
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    fail('FAIR_ROUND_INVALID_INPUT')
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