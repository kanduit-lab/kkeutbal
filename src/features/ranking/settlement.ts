export interface SettlementTransfer {
  readonly fromId: string
  readonly toId: string
  readonly amount: number
}

interface Party {
  readonly id: string
  remaining: number
}

export function computeSettlementTransfers(
  rows: readonly { readonly userId: string; readonly net: number }[],
): SettlementTransfer[] {
  const seen = new Set<string>()
  let netTotal = 0
  for (const row of rows) {
    if (!row.userId.trim()) throw new TypeError('Settlement userId must not be empty')
    if (seen.has(row.userId)) {
      throw new TypeError(`Settlement userId must be unique, received ${row.userId}`)
    }
    if (!Number.isSafeInteger(row.net)) {
      throw new RangeError(`Settlement net must be a safe integer, received ${row.net}`)
    }
    seen.add(row.userId)
    netTotal += row.net
    if (!Number.isSafeInteger(netTotal)) {
      throw new RangeError('Settlement net total exceeds the safe integer range')
    }
  }
  if (netTotal !== 0) {
    throw new RangeError(`Settlement net total must be zero, received ${netTotal}`)
  }

  const debtors: Party[] = rows
    .filter((row) => row.net < 0)
    .sort((a, b) => a.net - b.net || compareId(a.userId, b.userId))
    .map((row) => ({ id: row.userId, remaining: -row.net }))
  const creditors: Party[] = rows
    .filter((row) => row.net > 0)
    .sort((a, b) => b.net - a.net || compareId(a.userId, b.userId))
    .map((row) => ({ id: row.userId, remaining: row.net }))

  const transfers: SettlementTransfer[] = []
  let debtorIndex = 0
  let creditorIndex = 0
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex]!
    const creditor = creditors[creditorIndex]!
    const amount = Math.min(debtor.remaining, creditor.remaining)
    transfers.push({ fromId: debtor.id, toId: creditor.id, amount })
    debtor.remaining -= amount
    creditor.remaining -= amount

    if (debtor.remaining === 0) debtorIndex += 1
    if (creditor.remaining === 0) creditorIndex += 1
  }
  return transfers
}

function compareId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}