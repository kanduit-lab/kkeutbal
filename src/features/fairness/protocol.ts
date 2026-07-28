export const FAIRNESS_ALGORITHM_VERSION = 'kkeutbal-commit-reveal-hmac-fy-v1'

const PROTOCOL_DOMAIN = 'kkeutbal/fairness/v1'
const SEED_HEX_LENGTH = 64
const UINT32_RANGE = 0x1_0000_0000
const encoder = new TextEncoder()

export interface ClientSeedHash {
  readonly userId: string
  readonly seedHash: string
}

export interface FairShuffleInput {
  readonly roundId: string
  readonly serverSeed: string
  readonly clientSeedHashes: readonly ClientSeedHash[]

  readonly deckIds: readonly string[]
}

export interface FairShuffleResult {
  readonly algorithmVersion: typeof FAIRNESS_ALGORITHM_VERSION
  readonly serverSeedCommitment: string
  readonly finalSeed: string
  readonly finalSeedHash: string
  readonly clientSeedHashes: readonly ClientSeedHash[]
  readonly deckCommitment: string
  readonly shuffledDeckIds: readonly string[]
}

export interface FairShuffleReceipt {
  readonly roundId: string
  readonly serverSeed: string
  readonly serverSeedCommitment: string
  readonly clientSeedHashes: readonly ClientSeedHash[]
  readonly deckCommitment: string
  readonly shuffledDeckIds: readonly string[]
}

export interface FairShuffleVerification {
  readonly commitmentMatches: boolean
  readonly deckMatches: boolean
  readonly shuffledDeckMatches: boolean
  readonly valid: boolean
}

export function parseFairShuffleReceipt(value: unknown): FairShuffleReceipt {
  if (!isRecord(value)) throw new Error('Invalid fair shuffle receipt')
  const expectedKeys = [
    'roundId',
    'serverSeed',
    'serverSeedCommitment',
    'clientSeedHashes',
    'deckCommitment',
    'shuffledDeckIds',
  ]
  if (
    Object.keys(value).length !== expectedKeys.length ||
    expectedKeys.some((key) => !(key in value)) ||
    !Array.isArray(value.clientSeedHashes) ||
    !Array.isArray(value.shuffledDeckIds) ||
    typeof value.roundId !== 'string' ||
    typeof value.serverSeed !== 'string' ||
    typeof value.serverSeedCommitment !== 'string' ||
    typeof value.deckCommitment !== 'string' ||
    value.shuffledDeckIds.some((cardId) => typeof cardId !== 'string')
  ) {
    throw new Error('Invalid fair shuffle receipt')
  }
  return Object.freeze({
    roundId: requireId(value.roundId),
    serverSeed: normalizeSeed(value.serverSeed),
    serverSeedCommitment: normalizeHash(value.serverSeedCommitment),
    clientSeedHashes: canonicalizeClientSeedHashes(value.clientSeedHashes.map(parseClientSeedHash)),
    deckCommitment: normalizeHash(value.deckCommitment),
    shuffledDeckIds: Object.freeze(normalizeDeck(value.shuffledDeckIds)),
  })
}

export function generateFairnessSeed(): string {
  const bytes = new Uint8Array(SEED_HEX_LENGTH / 2)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

export async function commitServerSeed(roundId: string, serverSeed: string): Promise<string> {
  return sha256Canonical([
    PROTOCOL_DOMAIN,
    'server-commit',
    requireId(roundId),
    normalizeSeed(serverSeed),
  ])
}

export async function hashClientSeed(
  roundId: string,
  userId: string,
  clientSeed: string,
): Promise<string> {
  return sha256Canonical([
    PROTOCOL_DOMAIN,
    'client-seed',
    requireId(roundId),
    requireId(userId),
    normalizeSeed(clientSeed),
  ])
}

export async function deriveFinalSeed(
  roundId: string,
  serverSeed: string,
  clientSeedHashes: readonly ClientSeedHash[],
): Promise<string> {
  return sha256Canonical([
    PROTOCOL_DOMAIN,
    'final-seed',
    requireId(roundId),
    normalizeSeed(serverSeed),
    canonicalizeClientSeedHashes(clientSeedHashes).map((entry) => [entry.userId, entry.seedHash]),
  ])
}

export async function shuffleFairDeck(input: FairShuffleInput): Promise<FairShuffleResult> {
  const roundId = requireId(input.roundId)
  const serverSeed = normalizeSeed(input.serverSeed)
  const clientSeedHashes = canonicalizeClientSeedHashes(input.clientSeedHashes)
  const deckIds = normalizeDeck(input.deckIds)
  const [serverSeedCommitment, finalSeed] = await Promise.all([
    commitServerSeed(roundId, serverSeed),
    deriveFinalSeed(roundId, serverSeed, clientSeedHashes),
  ])
  const shuffledDeckIds = await fisherYates(deckIds, roundId, finalSeed)
  const [finalSeedHash, deckCommitment] = await Promise.all([
    sha256Canonical([PROTOCOL_DOMAIN, 'final-seed-hash', finalSeed]),
    commitDeck(shuffledDeckIds),
  ])

  return {
    algorithmVersion: FAIRNESS_ALGORITHM_VERSION,
    serverSeedCommitment,
    finalSeed,
    finalSeedHash,
    clientSeedHashes,
    deckCommitment,
    shuffledDeckIds,
  }
}

export async function verifyFairShuffle(
  receipt: FairShuffleReceipt,
  originalDeckIds: readonly string[],
): Promise<FairShuffleVerification> {
  try {
    const result = await shuffleFairDeck({
      roundId: receipt.roundId,
      serverSeed: receipt.serverSeed,
      clientSeedHashes: receipt.clientSeedHashes,
      deckIds: originalDeckIds,
    })
    const commitmentMatches =
      result.serverSeedCommitment === normalizeHash(receipt.serverSeedCommitment)
    const deckMatches = result.deckCommitment === normalizeHash(receipt.deckCommitment)
    const shuffledDeckMatches = arraysEqual(result.shuffledDeckIds, receipt.shuffledDeckIds)
    return {
      commitmentMatches,
      deckMatches,
      shuffledDeckMatches,
      valid: commitmentMatches && deckMatches && shuffledDeckMatches,
    }
  } catch {
    return {
      commitmentMatches: false,
      deckMatches: false,
      shuffledDeckMatches: false,
      valid: false,
    }
  }
}

function parseClientSeedHash(value: unknown): ClientSeedHash {
  if (!isRecord(value)) throw new Error('Invalid client seed hash')
  if (
    Object.keys(value).length !== 2 ||
    !('userId' in value) ||
    !('seedHash' in value) ||
    typeof value.userId !== 'string' ||
    typeof value.seedHash !== 'string'
  ) {
    throw new Error('Invalid client seed hash')
  }
  return { userId: requireId(value.userId), seedHash: normalizeHash(value.seedHash) }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function commitDeck(deckIds: readonly string[]): Promise<string> {
  return sha256Canonical([PROTOCOL_DOMAIN, 'deck', deckIds])
}

async function fisherYates(
  deckIds: readonly string[],
  roundId: string,
  finalSeed: string,
): Promise<string[]> {
  const shuffled = [...deckIds]
  const stream = new HmacWordStream(hexToBytes(finalSeed), roundId)

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = await stream.nextBounded(index + 1)
    const current = shuffled[index]
    const swap = shuffled[swapIndex]
    if (current === undefined || swap === undefined) throw new Error('Invalid shuffle index')
    shuffled[index] = swap
    shuffled[swapIndex] = current
  }

  return shuffled
}

class HmacWordStream {
  private counter = 0
  private block = new Uint8Array()
  private offset = 0
  private readonly keyPromise: Promise<CryptoKey>

  constructor(
    keyBytes: Uint8Array,
    private readonly roundId: string,
  ) {
    this.keyPromise = crypto.subtle.importKey(
      'raw',
      toArrayBuffer(keyBytes),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
  }

  async nextBounded(upperBound: number): Promise<number> {
    if (!Number.isInteger(upperBound) || upperBound < 1 || upperBound > UINT32_RANGE) {
      throw new Error('Invalid shuffle upper bound')
    }
    const acceptanceLimit = Math.floor(UINT32_RANGE / upperBound) * upperBound
    for (;;) {
      const word = await this.nextUint32()
      if (word < acceptanceLimit) return word % upperBound
    }
  }

  private async nextUint32(): Promise<number> {
    if (this.offset >= this.block.length) {
      if (!Number.isSafeInteger(this.counter)) throw new Error('Fairness stream counter exhausted')
      const key = await this.keyPromise
      const signature = await crypto.subtle.sign(
        'HMAC',
        key,
        toArrayBuffer(encodeCanonical([PROTOCOL_DOMAIN, 'draw', this.roundId, this.counter])),
      )
      this.counter += 1
      this.block = new Uint8Array(signature)
      this.offset = 0
    }

    const a = this.block[this.offset]
    const b = this.block[this.offset + 1]
    const c = this.block[this.offset + 2]
    const d = this.block[this.offset + 3]
    if (a === undefined || b === undefined || c === undefined || d === undefined) {
      throw new Error('Invalid HMAC output')
    }
    this.offset += 4
    return a * 0x1_000000 + b * 0x1_0000 + c * 0x100 + d
  }
}

async function sha256Canonical(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(encodeCanonical(value)))
  return bytesToHex(new Uint8Array(digest))
}

function encodeCanonical(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value))
}

function canonicalizeClientSeedHashes(
  clientSeedHashes: readonly ClientSeedHash[],
): readonly ClientSeedHash[] {
  const entries = clientSeedHashes.map((entry) => ({
    userId: requireId(entry.userId),
    seedHash: normalizeHash(entry.seedHash),
  }))

  entries.sort((left, right) =>
    left.userId < right.userId ? -1 : left.userId > right.userId ? 1 : 0,
  )
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index - 1]?.userId === entries[index]?.userId) {
      throw new Error('Duplicate client seed contributor')
    }
  }
  return entries
}

function normalizeDeck(deckIds: readonly string[]): string[] {
  if (deckIds.length < 2) throw new Error('A fair deck needs at least two cards')
  const normalized = deckIds.map((cardId) => requireId(cardId))
  if (new Set(normalized).size !== normalized.length)
    throw new Error('Deck card IDs must be unique')
  return normalized
}

function requireId(value: string): string {
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > 200)
    throw new Error('Invalid protocol identifier')
  return normalized
}

function normalizeSeed(value: string): string {
  const normalized = value.toLowerCase()
  if (!new RegExp(`^[0-9a-f]{${SEED_HEX_LENGTH}}$`).test(normalized)) {
    throw new Error('Fairness seeds must be 32-byte hex strings')
  }
  return normalized
}

function normalizeHash(value: string): string {
  return normalizeSeed(value)
}

function hexToBytes(value: string): Uint8Array {
  const normalized = normalizeSeed(value)
  const bytes = new Uint8Array(normalized.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    const pair = normalized.slice(index * 2, index * 2 + 2)
    bytes[index] = Number.parseInt(pair, 16)
  }
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}