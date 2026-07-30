import { z } from 'zod'

import {
  FAIRNESS_ALGORITHM_VERSION,
  type ClientSeedHash,
  type FairShuffleResult,
} from './protocol'

export const FAIRNESS_PUBLIC_RECEIPT_VERSION = 'kkeutbal-public-fairness-receipt-v1'

export const HASH_PATTERN = /^[0-9a-f]{64}$/

export type FairnessAuditedGame = 'seotda' | 'holdem'

export interface PublicFairnessDealPlan {
  readonly game: FairnessAuditedGame
  readonly participantCount: number
  readonly deckSize: number
  readonly privateCardsPerParticipant: number
  readonly publicBoardStages: readonly number[]
  readonly dealPlanCommitment: string
}

export interface PublicFairnessSeedAuditPlan {
  readonly protocol: 'commit-reveal'
  readonly serverSeedCommitment: string
  readonly clientSeedHashes: readonly ClientSeedHash[]
  readonly finalSeedHash: string
  readonly revealPolicy: 'after-round-finalized-authenticated-audit'
}

export interface PublicFairnessReceipt {
  readonly receiptVersion: typeof FAIRNESS_PUBLIC_RECEIPT_VERSION
  readonly algorithmVersion: typeof FAIRNESS_ALGORITHM_VERSION
  readonly roundId: string
  readonly game: FairnessAuditedGame
  readonly seedAudit: PublicFairnessSeedAuditPlan
  readonly dealPlan: PublicFairnessDealPlan

  readonly shuffledDeckCommitment: string
}

export interface CreatePublicFairnessReceiptInput {
  readonly roundId: string
  readonly game: FairnessAuditedGame
  readonly participantCount: number

  readonly shuffle: Pick<
    FairShuffleResult,
    | 'algorithmVersion'
    | 'serverSeedCommitment'
    | 'clientSeedHashes'
    | 'finalSeedHash'
    | 'deckCommitment'
    | 'shuffledDeckIds'
  >
}

export const idSchema = z.string().trim().min(1).max(200)
export const hashSchema = z.string().regex(HASH_PATTERN, 'Expected a lowercase SHA-256 hex hash')
export const clientSeedHashSchema = z
  .object({
    userId: idSchema,
    seedHash: hashSchema,
  })
  .strict()

export const publicDealPlanSchema = z
  .object({
    game: z.enum(['seotda', 'holdem']),
    participantCount: z.number().int().min(2),
    deckSize: z.number().int().positive(),
    privateCardsPerParticipant: z.number().int().positive(),
    publicBoardStages: z.array(z.number().int().positive()),
    dealPlanCommitment: hashSchema,
  })
  .strict()

export const publicSeedAuditSchema = z
  .object({
    protocol: z.literal('commit-reveal'),
    serverSeedCommitment: hashSchema,
    clientSeedHashes: z.array(clientSeedHashSchema),
    finalSeedHash: hashSchema,
    revealPolicy: z.literal('after-round-finalized-authenticated-audit'),
  })
  .strict()

export const publicFairnessReceiptSchema = z
  .object({
    receiptVersion: z.literal(FAIRNESS_PUBLIC_RECEIPT_VERSION),
    algorithmVersion: z.literal(FAIRNESS_ALGORITHM_VERSION),
    roundId: idSchema,
    game: z.enum(['seotda', 'holdem']),
    seedAudit: publicSeedAuditSchema,
    dealPlan: publicDealPlanSchema,
    shuffledDeckCommitment: hashSchema,
  })
  .strict()

export const GAME_DEAL_RULES: Readonly<
  Record<
    FairnessAuditedGame,
    Readonly<{
      deckSize: number
      privateCardsPerParticipant: number
      publicBoardStages: readonly number[]
    }>
  >
> = Object.freeze({
  seotda: Object.freeze({ deckSize: 20, privateCardsPerParticipant: 2, publicBoardStages: [] }),
  holdem: Object.freeze({
    deckSize: 52,
    privateCardsPerParticipant: 2,
    publicBoardStages: [3, 1, 1],
  }),
})
