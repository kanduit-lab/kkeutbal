import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/env', () => ({
  serverEnv: () => ({ AUTH_SECRET: 'fairness-seed-crypto-unit-test-secret' }),
}))

import {
  decryptFairnessServerSeed,
  encryptFairnessServerSeed,
  FAIRNESS_SEED_CIPHER_VERSION,
} from './seed-crypto'

const serverSeed = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

describe('fairness server seed encryption', () => {
  it('round-trips a canonical 32-byte seed with a versioned, authenticated ciphertext', () => {
    const ciphertext = encryptFairnessServerSeed(serverSeed)

    expect(ciphertext).toMatch(
      new RegExp(
        `^fairness-seed\\.${FAIRNESS_SEED_CIPHER_VERSION}\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$`,
      ),
    )
    expect(ciphertext).not.toContain(serverSeed)
    expect(decryptFairnessServerSeed(ciphertext)).toBe(serverSeed)
  })

  it('uses a fresh nonce, while decrypting each ciphertext to the same seed', () => {
    const first = encryptFairnessServerSeed(serverSeed)
    const second = encryptFairnessServerSeed(serverSeed)

    expect(first).not.toBe(second)
    expect(decryptFairnessServerSeed(first)).toBe(serverSeed)
    expect(decryptFairnessServerSeed(second)).toBe(serverSeed)
  })

  it('rejects malformed plaintext seeds before encryption', () => {
    expect(() => encryptFairnessServerSeed('not-a-seed')).toThrow('32-byte hex')
    expect(() => encryptFairnessServerSeed(`${serverSeed}00`)).toThrow('32-byte hex')
    expect(() => encryptFairnessServerSeed(` ${serverSeed}`)).toThrow('32-byte hex')
  })

  it('rejects malformed, truncated, and authenticated-but-tampered ciphertext', () => {
    const ciphertext = encryptFairnessServerSeed(serverSeed)
    const [prefix, version, iv, authTag, encrypted] = ciphertext.split('.')
    const replacement = encrypted!.endsWith('A') ? 'B' : 'A'
    const tamperedCiphertext = `${prefix}.${version}.${iv}.${authTag}.${encrypted!.slice(0, -1)}${replacement}`

    for (const invalid of [
      'fairness-seed.v0.iv.tag.ciphertext',
      'fairness-seed.v1.!.tag.ciphertext',
      'fairness-seed.v1.a.b.c.extra',
      'fairness-seed.v1.a.b.c',
      tamperedCiphertext,
    ]) {
      expect(() => decryptFairnessServerSeed(invalid)).toThrow(
        'Invalid fairness server seed ciphertext',
      )
    }
  })
})
