import { describe, expect, it } from 'vitest'
import { defaultFundingMode, parseFundingMode, readFundingMode } from './funding-mode'

describe('room funding mode', () => {
  it('accepts only the two explicit funding modes', () => {
    expect(parseFundingMode('session')).toBe('session')
    expect(parseFundingMode('account_credit')).toBe('account_credit')
  })

  it('rejects non-string and unknown explicit inputs', () => {
    expect(() => parseFundingMode(undefined)).toThrow()
    expect(() => parseFundingMode('wallet')).toThrow()
    expect(() => parseFundingMode({ fundingMode: 'account_credit' })).toThrow()
  })

  it('uses account credit only when a stored rule preset contains the exact value', () => {
    expect(readFundingMode({ fundingMode: 'account_credit' })).toBe('account_credit')
    expect(readFundingMode({ fundingMode: 'session' })).toBe('session')
  })

  it('keeps untrusted, missing, and malformed presets in session mode', () => {
    expect(readFundingMode(null)).toBe(defaultFundingMode)
    expect(readFundingMode([])).toBe(defaultFundingMode)
    expect(readFundingMode({ fundingMode: true })).toBe(defaultFundingMode)
    expect(readFundingMode({ fundingMode: 'credit' })).toBe(defaultFundingMode)
  })
})