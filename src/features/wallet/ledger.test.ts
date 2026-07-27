import { describe, expect, it } from 'vitest'
import { ISSUANCE_ACCOUNT_ID, adminAdjustmentEntries, validateCreditEntries } from './ledger'

const accountId = '11111111-1111-4111-8111-111111111111'

describe('virtual credit ledger entries', () => {
  it('makes balanced grant entries', () => {
    const entries = adminAdjustmentEntries(accountId, 500)

    expect(entries).toEqual([
      { account_id: accountId, delta_available: 500, delta_locked: 0 },
      { account_id: ISSUANCE_ACCOUNT_ID, delta_available: -500, delta_locked: 0 },
    ])
    expect(() => validateCreditEntries(entries)).not.toThrow()
  })

  it('makes balanced revoke entries', () => {
    const entries = adminAdjustmentEntries(accountId, -200)

    expect(entries).toEqual([
      { account_id: accountId, delta_available: -200, delta_locked: 0 },
      { account_id: ISSUANCE_ACCOUNT_ID, delta_available: 200, delta_locked: 0 },
    ])
    expect(() => validateCreditEntries(entries)).not.toThrow()
  })

  it('rejects malformed, duplicate, and unbalanced entries', () => {
    expect(() => adminAdjustmentEntries(accountId, 0)).toThrow('nonzero')
    expect(() =>
      validateCreditEntries([
        { account_id: accountId, delta_available: 10, delta_locked: 0 },
        { account_id: accountId, delta_available: -10, delta_locked: 0 },
      ]),
    ).toThrow('one credit entry')
    expect(() =>
      validateCreditEntries([
        { account_id: accountId, delta_available: 10, delta_locked: 0 },
        { account_id: ISSUANCE_ACCOUNT_ID, delta_available: -9, delta_locked: 0 },
      ]),
    ).toThrow('balance to zero')
  })
})
