import { describe, expect, it } from 'vitest'
import {
  defaultFairPlaySettings,
  parseFairPlaySettings,
  readFairPlaySettings,
  supportsVerifiedDealing,
} from './fair-play-settings'

const verifiedSettings = {
  dealing: 'verified' as const,
  seedCollectionSeconds: 45,
  turnTimeoutSeconds: 90,
  timeoutPolicy: 'pause' as const,
}

describe('fair-play room settings', () => {
  it('accepts complete verified settings only for supported card games', () => {
    expect(parseFairPlaySettings('seotda', verifiedSettings)).toEqual(verifiedSettings)
    expect(parseFairPlaySettings('poker', verifiedSettings)).toEqual(verifiedSettings)
    expect(supportsVerifiedDealing('gostop')).toBe(false)
  })

  it('rejects incomplete, mistyped, out-of-range, and incompatible explicit input', () => {
    expect(() => parseFairPlaySettings('seotda', { dealing: 'manual' })).toThrow()
    expect(() =>
      parseFairPlaySettings('seotda', { ...verifiedSettings, seedCollectionSeconds: '45' }),
    ).toThrow()
    expect(() =>
      parseFairPlaySettings('seotda', { ...verifiedSettings, turnTimeoutSeconds: 181 }),
    ).toThrow()
    expect(() => parseFairPlaySettings('gostop', verifiedSettings)).toThrow(
      'Verified dealing is not supported',
    )
  })

  it('reads only a valid stored fair_play object', () => {
    expect(readFairPlaySettings('seotda', { fair_play: verifiedSettings })).toEqual(
      verifiedSettings,
    )
    expect(readFairPlaySettings('poker', { fair_play: { ...verifiedSettings, extra: true } })).toEqual(
      defaultFairPlaySettings,
    )
  })

  it('falls back to a fresh conservative default for untrusted or incompatible presets', () => {
    const fromMissing = readFairPlaySettings('seotda', null)
    const fromMalformed = readFairPlaySettings('poker', { fair_play: ['verified'] })
    const fromGoStop = readFairPlaySettings('gostop', { fair_play: verifiedSettings })

    expect(fromMissing).toEqual(defaultFairPlaySettings)
    expect(fromMalformed).toEqual(defaultFairPlaySettings)
    expect(fromGoStop).toEqual(defaultFairPlaySettings)
    expect(fromMissing).not.toBe(defaultFairPlaySettings)
  })
})
