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
  // 딴 쪽과 잃은 쪽을 따로 누적한다. 하나의 `netTotal`에 몰아 더하면 같은 행 묶음이라도
  // **입력 순서에 따라** 중간 합이 안전 정수 범위를 넘었다 안 넘었다 해서, 어떤 순서로
  // 주느냐에 따라 던지기도 하고 통과하기도 한다. 한쪽씩 모으면 각 합이 단조 증가라
  // 순서와 무관하게 같은 판정이 나온다.
  let wonTotal = 0
  let lostTotal = 0
  for (const row of rows) {
    if (!row.userId.trim()) throw new TypeError('Settlement userId must not be empty')
    if (seen.has(row.userId)) {
      throw new TypeError(`Settlement userId must be unique, received ${row.userId}`)
    }
    if (!Number.isSafeInteger(row.net)) {
      throw new RangeError(`Settlement net must be a safe integer, received ${row.net}`)
    }
    seen.add(row.userId)
    if (row.net > 0) wonTotal += row.net
    else lostTotal -= row.net
    if (!Number.isSafeInteger(wonTotal) || !Number.isSafeInteger(lostTotal)) {
      throw new RangeError('Settlement net total exceeds the safe integer range')
    }
  }
  if (wonTotal !== lostTotal) {
    throw new RangeError(`Settlement net total must be zero, received ${wonTotal - lostTotal}`)
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