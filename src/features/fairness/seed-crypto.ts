import 'server-only'

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { serverEnv } from '@/lib/env'

export const FAIRNESS_SEED_CIPHER_VERSION = 'v1'

const CIPHER_PREFIX = 'fairness-seed'
const CIPHER_ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const SERVER_SEED_HEX_LENGTH = 64
const CIPHERTEXT_LENGTH = SERVER_SEED_HEX_LENGTH
const KDF_SALT = 'kkeutbal/key-derivation-salt/v1'
const KDF_INFO = 'kkeutbal/fairness/server-seed-encryption/v1'
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/

export function encryptFairnessServerSeed(serverSeed: string): string {
  const normalizedSeed = normalizeServerSeed(serverSeed)
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(CIPHER_ALGORITHM, encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(normalizedSeed, 'utf8'), cipher.final()])

  return [
    CIPHER_PREFIX,
    FAIRNESS_SEED_CIPHER_VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.')
}

export function decryptFairnessServerSeed(ciphertext: string): string {
  const parts = parseCiphertext(ciphertext)
  const key = encryptionKey()

  try {
    const decipher = createDecipheriv(CIPHER_ALGORITHM, key, parts.iv)
    decipher.setAuthTag(parts.authTag)
    const plaintext = Buffer.concat([decipher.update(parts.ciphertext), decipher.final()]).toString(
      'utf8',
    )
    return normalizeServerSeed(plaintext)
  } catch {
    throw invalidCiphertextError()
  }
}

function encryptionKey(): Buffer {
  return Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(serverEnv().AUTH_SECRET, 'utf8'),
      Buffer.from(KDF_SALT, 'utf8'),
      Buffer.from(KDF_INFO, 'utf8'),
      KEY_LENGTH,
    ),
  )
}

function parseCiphertext(value: string): {
  readonly iv: Buffer
  readonly authTag: Buffer
  readonly ciphertext: Buffer
} {
  if (typeof value !== 'string') throw invalidCiphertextError()

  const [prefix, version, ivRaw, authTagRaw, ciphertextRaw, ...rest] = value.split('.')
  if (
    prefix !== CIPHER_PREFIX ||
    version !== FAIRNESS_SEED_CIPHER_VERSION ||
    !ivRaw ||
    !authTagRaw ||
    !ciphertextRaw ||
    rest.length > 0
  ) {
    throw invalidCiphertextError()
  }

  const iv = decodeBase64url(ivRaw)
  const authTag = decodeBase64url(authTagRaw)
  const ciphertext = decodeBase64url(ciphertextRaw)
  if (
    iv.length !== IV_LENGTH ||
    authTag.length !== AUTH_TAG_LENGTH ||
    ciphertext.length !== CIPHERTEXT_LENGTH
  ) {
    throw invalidCiphertextError()
  }

  return { iv, authTag, ciphertext }
}

function decodeBase64url(value: string): Buffer {
  if (!BASE64URL_PATTERN.test(value)) throw invalidCiphertextError()

  const decoded = Buffer.from(value, 'base64url')

  if (decoded.length === 0 || decoded.toString('base64url') !== value)
    throw invalidCiphertextError()
  return decoded
}

function normalizeServerSeed(value: string): string {
  if (typeof value !== 'string')
    throw new Error('Fairness server seed must be a 32-byte hex string')

  const normalized = value.toLowerCase()
  if (!new RegExp(`^[0-9a-f]{${SERVER_SEED_HEX_LENGTH}}$`).test(normalized)) {
    throw new Error('Fairness server seed must be a 32-byte hex string')
  }
  return normalized
}

function invalidCiphertextError(): Error {
  return new Error('Invalid fairness server seed ciphertext')
}