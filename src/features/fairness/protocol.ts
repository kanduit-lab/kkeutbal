/**
 * 공정 셔플의 독립 검증 가능한 commit-reveal 프로토콜.
 *
 * 이 모듈은 브라우저와 서버 양쪽에서 같은 Web Crypto 구현으로 실행된다. DB·환경변수·네트워크에
 * 의존하지 않으므로, 종료 뒤 참가자가 공개 영수증만으로 결과를 재현하는 데에도 쓴다.
 */

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
  /** 게임의 고정 정렬 원본 덱. 카드 ID는 중복될 수 없다. */
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

/** 암호학적으로 무작위인 32-byte hex seed를 만든다. */
export function generateFairnessSeed(): string {
  const bytes = new Uint8Array(SEED_HEX_LENGTH / 2)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

/** 서버가 배분 전에 공개하는 commitment. */
export async function commitServerSeed(roundId: string, serverSeed: string): Promise<string> {
  return sha256Canonical([PROTOCOL_DOMAIN, 'server-commit', requireId(roundId), normalizeSeed(serverSeed)])
}

/** 참가자의 원문 seed를 저장하지 않고도 기여를 증명할 수 있는 hash. */
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

/** server seed와 확정된 참가자 hash를 결합한 final seed. */
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

/**
 * HMAC-SHA-256 counter stream + rejection sampling으로 Fisher-Yates 셔플을 수행한다.
 * input과 결과를 변경하지 않는다.
 */
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

/** 공개된 영수증이 원래 덱과 정확히 일치하는지 독립적으로 재계산한다. */
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
    const commitmentMatches = result.serverSeedCommitment === normalizeHash(receipt.serverSeedCommitment)
    const deckMatches = result.deckCommitment === normalizeHash(receipt.deckCommitment)
    const shuffledDeckMatches = arraysEqual(result.shuffledDeckIds, receipt.shuffledDeckIds)
    return {
      commitmentMatches,
      deckMatches,
      shuffledDeckMatches,
      valid: commitmentMatches && deckMatches && shuffledDeckMatches,
    }
  } catch {
    // 외부에서 받은 영수증은 형식 오류도 "검증 실패"로 처리한다. UI 검증 화면이 죽으면 안 된다.
    return {
      commitmentMatches: false,
      deckMatches: false,
      shuffledDeckMatches: false,
      valid: false,
    }
  }
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

/** HMAC 출력 32 bytes를 네 개의 unsigned 32-bit word로 읽는 결정적 스트림. */
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

/** 배열만 사용해 객체 key 순서 차이가 verifier 결과에 영향을 주지 않게 한다. */
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
  // UUID 같은 protocol identifier는 locale 규칙이 아니라 code-point 순으로 정렬해야 다른 verifier와
  // 운영체제가 달라도 같은 final seed를 만든다.
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
  if (new Set(normalized).size !== normalized.length) throw new Error('Deck card IDs must be unique')
  return normalized
}

function requireId(value: string): string {
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > 200) throw new Error('Invalid protocol identifier')
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

/** Web Crypto DOM typings require a concrete ArrayBuffer, not ArrayBufferLike. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}
