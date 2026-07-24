/**
 * 게임 진행 중 Broadcast/공개 화면에 안전하게 실을 수 있는 공정성 영수증.
 *
 * 이 파일은 commit-reveal의 "공개 commitment"만 표현한다. 원문 server seed, final seed,
 * 셔플된 덱 및 좌석별 패는 절대로 이 타입이나 직렬화 결과에 포함하지 않는다. 라운드 종료 뒤
 * 독립 감사를 허용하는 seed/deck 공개는 별도 인증된 감사 경로에서만 protocol.ts의
 * FairShuffleReceipt를 사용해야 한다.
 */

import { z } from 'zod'

import {
  FAIRNESS_ALGORITHM_VERSION,
  type ClientSeedHash,
  type FairShuffleResult,
} from './protocol'

export const FAIRNESS_PUBLIC_RECEIPT_VERSION = 'kkeutbal-public-fairness-receipt-v1'

const RECEIPT_DOMAIN = 'kkeutbal/fairness/public-receipt/v1'
const HASH_PATTERN = /^[0-9a-f]{64}$/
const encoder = new TextEncoder()

export type FairnessAuditedGame = 'seotda' | 'holdem'

/** 실제 카드가 아닌 배분 규칙의 공개 commitment. */
export interface PublicFairnessDealPlan {
  readonly game: FairnessAuditedGame
  readonly participantCount: number
  readonly deckSize: number
  readonly privateCardsPerParticipant: number
  readonly publicBoardStages: readonly number[]
  readonly dealPlanCommitment: string
}

/**
 * 원문 seed 없이도 미리 확인할 수 있는 감사 계획.
 * `finalSeedHash`는 server seed 공개 전에는 결과를 바꿀 수 없게 묶는 용도이며 원문은 아니다.
 */
export interface PublicFairnessSeedAuditPlan {
  readonly protocol: 'commit-reveal'
  readonly serverSeedCommitment: string
  readonly clientSeedHashes: readonly ClientSeedHash[]
  readonly finalSeedHash: string
  readonly revealPolicy: 'after-round-finalized-authenticated-audit'
}

/** Broadcast, 링크 공유, 관리자 기록에 안전한 라운드 단위 공정성 영수증. */
export interface PublicFairnessReceipt {
  readonly receiptVersion: typeof FAIRNESS_PUBLIC_RECEIPT_VERSION
  readonly algorithmVersion: typeof FAIRNESS_ALGORITHM_VERSION
  readonly roundId: string
  readonly game: FairnessAuditedGame
  readonly seedAudit: PublicFairnessSeedAuditPlan
  readonly dealPlan: PublicFairnessDealPlan
  /** 셔플 결과 전체에 대한 hash. 카드 ID나 좌석별 배분은 공개하지 않는다. */
  readonly shuffledDeckCommitment: string
}

export interface CreatePublicFairnessReceiptInput {
  readonly roundId: string
  readonly game: FairnessAuditedGame
  readonly participantCount: number
  /** 서버 내부에서만 얻는 결과다. public receipt에는 안전한 commitment만 선택해 담는다. */
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

const idSchema = z.string().trim().min(1).max(200)
const hashSchema = z.string().regex(HASH_PATTERN, 'Expected a lowercase SHA-256 hex hash')
const clientSeedHashSchema = z
  .object({
    userId: idSchema,
    seedHash: hashSchema,
  })
  .strict()

const publicDealPlanSchema = z
  .object({
    game: z.enum(['seotda', 'holdem']),
    participantCount: z.number().int().min(2),
    deckSize: z.number().int().positive(),
    privateCardsPerParticipant: z.number().int().positive(),
    publicBoardStages: z.array(z.number().int().positive()),
    dealPlanCommitment: hashSchema,
  })
  .strict()

const publicSeedAuditSchema = z
  .object({
    protocol: z.literal('commit-reveal'),
    serverSeedCommitment: hashSchema,
    clientSeedHashes: z.array(clientSeedHashSchema),
    finalSeedHash: hashSchema,
    revealPolicy: z.literal('after-round-finalized-authenticated-audit'),
  })
  .strict()

const publicFairnessReceiptSchema = z
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

const GAME_DEAL_RULES: Readonly<
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
  holdem: Object.freeze({ deckSize: 52, privateCardsPerParticipant: 2, publicBoardStages: [3, 1, 1] }),
})

/** 섯다(20장·2장 패)와 홀덤(52장·2장 패·flop/turn/river)의 공개 배분 약속을 만든다. */
export async function createPublicFairnessDealPlan(
  roundId: string,
  game: FairnessAuditedGame,
  participantCount: number,
): Promise<PublicFairnessDealPlan> {
  const normalizedRoundId = parseRoundId(roundId)
  const rules = GAME_DEAL_RULES[game]
  if (!rules) throw new Error('Unsupported public fairness game')
  if (!Number.isInteger(participantCount) || participantCount < 2) {
    throw new Error('A fair game needs at least two participants')
  }

  const publicBoardStages = [...rules.publicBoardStages]
  const cardsRequired = participantCount * rules.privateCardsPerParticipant + sum(publicBoardStages)
  if (cardsRequired > rules.deckSize) {
    throw new Error('Deal plan exceeds the fixed game deck')
  }

  const dealPlanCommitment = await hashCanonical([
    RECEIPT_DOMAIN,
    'deal-plan',
    normalizedRoundId,
    game,
    participantCount,
    rules.deckSize,
    rules.privateCardsPerParticipant,
    publicBoardStages,
  ])

  return freezeDealPlan({
    game,
    participantCount,
    deckSize: rules.deckSize,
    privateCardsPerParticipant: rules.privateCardsPerParticipant,
    publicBoardStages,
    dealPlanCommitment,
  })
}

/** 서버의 셔플 결과에서 공개 가능한 hash만 뽑아, 안전한 영수증을 만든다. */
export async function createPublicFairnessReceipt(
  input: CreatePublicFairnessReceiptInput,
): Promise<PublicFairnessReceipt> {
  if (input.shuffle.algorithmVersion !== FAIRNESS_ALGORITHM_VERSION) {
    throw new Error('Unsupported fairness algorithm version')
  }

  const roundId = parseRoundId(input.roundId)
  const game = input.game
  const clientSeedHashes = canonicalizeClientSeedHashes(input.shuffle.clientSeedHashes)
  const dealPlan = await createPublicFairnessDealPlan(roundId, game, input.participantCount)
  if (input.shuffle.shuffledDeckIds.length !== dealPlan.deckSize) {
    throw new Error('Shuffle result does not match the fixed game deck size')
  }

  return parsePublicFairnessReceipt({
    receiptVersion: FAIRNESS_PUBLIC_RECEIPT_VERSION,
    algorithmVersion: FAIRNESS_ALGORITHM_VERSION,
    roundId,
    game,
    seedAudit: {
      protocol: 'commit-reveal',
      serverSeedCommitment: input.shuffle.serverSeedCommitment,
      clientSeedHashes,
      finalSeedHash: input.shuffle.finalSeedHash,
      revealPolicy: 'after-round-finalized-authenticated-audit',
    },
    dealPlan,
    shuffledDeckCommitment: input.shuffle.deckCommitment,
  })
}

/** 외부 JSON을 엄격하게 해석한다. 비밀 필드·개인 카드 같은 알 수 없는 필드는 거부한다. */
export function parsePublicFairnessReceipt(value: unknown): PublicFairnessReceipt {
  const parsed = publicFairnessReceiptSchema.parse(value)
  const roundId = parseRoundId(parsed.roundId)
  const clientSeedHashes = canonicalizeClientSeedHashes(parsed.seedAudit.clientSeedHashes)
  assertStaticDealPlan(parsed.game, parsed.dealPlan)

  return freezeReceipt({
    receiptVersion: parsed.receiptVersion,
    algorithmVersion: parsed.algorithmVersion,
    roundId,
    game: parsed.game,
    seedAudit: {
      protocol: parsed.seedAudit.protocol,
      serverSeedCommitment: normalizeHash(parsed.seedAudit.serverSeedCommitment),
      clientSeedHashes,
      finalSeedHash: normalizeHash(parsed.seedAudit.finalSeedHash),
      revealPolicy: parsed.seedAudit.revealPolicy,
    },
    dealPlan: {
      game: parsed.dealPlan.game,
      participantCount: parsed.dealPlan.participantCount,
      deckSize: parsed.dealPlan.deckSize,
      privateCardsPerParticipant: parsed.dealPlan.privateCardsPerParticipant,
      publicBoardStages: parsed.dealPlan.publicBoardStages,
      dealPlanCommitment: normalizeHash(parsed.dealPlan.dealPlanCommitment),
    },
    shuffledDeckCommitment: normalizeHash(parsed.shuffledDeckCommitment),
  })
}

/** commitment가 round와 공개 배분 규칙에 맞는지만 검증한다. seed나 카드 원문은 요구하지 않는다. */
export async function verifyPublicFairnessReceipt(value: unknown): Promise<boolean> {
  try {
    const receipt = parsePublicFairnessReceipt(value)
    const expectedPlan = await createPublicFairnessDealPlan(
      receipt.roundId,
      receipt.game,
      receipt.dealPlan.participantCount,
    )
    return receipt.dealPlan.dealPlanCommitment === expectedPlan.dealPlanCommitment
  } catch {
    return false
  }
}

/**
 * 안정적인 JSON 문자열을 만든다. 이 직렬화 경계는 strict parser를 통과한 필드만 내보내므로
 * 실수로 serverSeed, finalSeed, shuffledDeckIds, privateCards를 Broadcast에 보내지 못하게 한다.
 */
export async function serializePublicFairnessReceipt(value: unknown): Promise<string> {
  const receipt = parsePublicFairnessReceipt(value)
  if (!(await verifyPublicFairnessReceipt(receipt))) {
    throw new Error('Public fairness receipt has an invalid deal plan commitment')
  }

  return JSON.stringify({
    receiptVersion: receipt.receiptVersion,
    algorithmVersion: receipt.algorithmVersion,
    roundId: receipt.roundId,
    game: receipt.game,
    seedAudit: {
      protocol: receipt.seedAudit.protocol,
      serverSeedCommitment: receipt.seedAudit.serverSeedCommitment,
      clientSeedHashes: receipt.seedAudit.clientSeedHashes.map((entry) => ({
        userId: entry.userId,
        seedHash: entry.seedHash,
      })),
      finalSeedHash: receipt.seedAudit.finalSeedHash,
      revealPolicy: receipt.seedAudit.revealPolicy,
    },
    dealPlan: {
      game: receipt.dealPlan.game,
      participantCount: receipt.dealPlan.participantCount,
      deckSize: receipt.dealPlan.deckSize,
      privateCardsPerParticipant: receipt.dealPlan.privateCardsPerParticipant,
      publicBoardStages: [...receipt.dealPlan.publicBoardStages],
      dealPlanCommitment: receipt.dealPlan.dealPlanCommitment,
    },
    shuffledDeckCommitment: receipt.shuffledDeckCommitment,
  })
}

/** JSON round-trip을 하면서 commitment와 공개 안전성까지 함께 확인한다. */
export async function deserializePublicFairnessReceipt(serialized: string): Promise<PublicFairnessReceipt> {
  let value: unknown
  try {
    value = JSON.parse(serialized) as unknown
  } catch {
    throw new Error('Invalid public fairness receipt JSON')
  }

  const receipt = parsePublicFairnessReceipt(value)
  if (!(await verifyPublicFairnessReceipt(receipt))) {
    throw new Error('Public fairness receipt has an invalid deal plan commitment')
  }
  return receipt
}

function parseRoundId(value: string): string {
  return idSchema.parse(value)
}

function canonicalizeClientSeedHashes(entries: readonly ClientSeedHash[]): readonly ClientSeedHash[] {
  const normalized = entries.map((entry) => ({
    userId: parseRoundId(entry.userId),
    seedHash: normalizeHash(entry.seedHash),
  }))
  normalized.sort((left, right) =>
    left.userId < right.userId ? -1 : left.userId > right.userId ? 1 : 0,
  )
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index - 1]?.userId === normalized[index]?.userId) {
      throw new Error('Duplicate client seed contributor')
    }
  }
  return Object.freeze(normalized.map((entry) => Object.freeze(entry)))
}

function assertStaticDealPlan(game: FairnessAuditedGame, plan: z.infer<typeof publicDealPlanSchema>): void {
  if (plan.game !== game) throw new Error('Receipt game and deal plan game do not match')
  const rules = GAME_DEAL_RULES[game]
  if (
    plan.deckSize !== rules.deckSize ||
    plan.privateCardsPerParticipant !== rules.privateCardsPerParticipant ||
    !numbersEqual(plan.publicBoardStages, rules.publicBoardStages)
  ) {
    throw new Error('Receipt deal plan does not match the fixed game rules')
  }
  if (plan.participantCount * plan.privateCardsPerParticipant + sum(plan.publicBoardStages) > plan.deckSize) {
    throw new Error('Receipt deal plan exceeds the fixed game deck')
  }
}

function normalizeHash(value: string): string {
  const normalized = hashSchema.parse(value.toLowerCase())
  return normalized
}

async function hashCanonical(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(encoder.encode(JSON.stringify(value))))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function freezeDealPlan(plan: PublicFairnessDealPlan): PublicFairnessDealPlan {
  return Object.freeze({
    ...plan,
    publicBoardStages: Object.freeze([...plan.publicBoardStages]),
  })
}

function freezeReceipt(receipt: PublicFairnessReceipt): PublicFairnessReceipt {
  return Object.freeze({
    ...receipt,
    seedAudit: Object.freeze({
      ...receipt.seedAudit,
      clientSeedHashes: Object.freeze(
        receipt.seedAudit.clientSeedHashes.map((entry) => Object.freeze({ ...entry })),
      ),
    }),
    dealPlan: freezeDealPlan(receipt.dealPlan),
  })
}

function numbersEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}
