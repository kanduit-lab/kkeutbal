export const ISSUANCE_ACCOUNT_ID = '00000000-0000-4000-8000-000000000001'

export interface CreditEntryRequest {
  readonly account_id: string
  readonly delta_available: number
  readonly delta_locked: number
}

export function adminAdjustmentEntries(
  targetAccountId: string,
  amount: number,
): readonly CreditEntryRequest[] {
  if (!isIdentifier(targetAccountId)) throw new Error('Target credit account is required')
  if (!Number.isSafeInteger(amount) || amount === 0) {
    throw new Error('Credit adjustment amount must be a nonzero safe integer')
  }

  return [
    {
      account_id: targetAccountId,
      delta_available: amount,
      delta_locked: 0,
    },
    {
      account_id: ISSUANCE_ACCOUNT_ID,
      delta_available: -amount,
      delta_locked: 0,
    },
  ]
}

export function validateCreditEntries(entries: readonly CreditEntryRequest[]): void {
  if (entries.length === 0) throw new Error('Credit transaction needs entries')
  const accountIds = new Set<string>()
  let total = 0

  for (const entry of entries) {
    if (!isIdentifier(entry.account_id)) throw new Error('Credit entry account is required')
    if (!Number.isSafeInteger(entry.delta_available) || !Number.isSafeInteger(entry.delta_locked)) {
      throw new Error('Credit deltas must be safe integers')
    }
    if (entry.delta_available === 0 && entry.delta_locked === 0) {
      throw new Error('Credit entry must change a balance')
    }
    if (accountIds.has(entry.account_id))
      throw new Error('Only one credit entry per account is allowed')
    accountIds.add(entry.account_id)
    total += entry.delta_available + entry.delta_locked
  }

  if (!Number.isSafeInteger(total) || total !== 0) {
    throw new Error('Credit transaction must balance to zero')
  }
}

function isIdentifier(value: string): boolean {
  const normalized = value.trim()
  return normalized.length > 0 && normalized.length <= 200
}