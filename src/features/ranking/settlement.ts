/**
 * 정산 이체 계산 — 세션이 끝났을 때 누가 누구에게 얼마를 보내면 되는지.
 *
 * 게임 엔진과 같은 계약의 순수 함수 — I/O·DB 접근 금지.
 *
 * 그리디: 최대 채무자 → 최대 채권자 순으로 상계해 이체 수를 인원-1 이하로 줄인다.
 * 정렬 기준(net → userId)이 고정이라 입력 순서와 무관하게 결과가 결정적이다.
 *
 * net 합이 0이 아닌 입력(부분 데이터·집계 오류)은 던지지 않는다 — 상계 가능한
 * 만큼만 정산하고 나머지 잔액은 이체 없이 남긴다. 결과 화면이 죽는 것보다
 * 부분 정산이 낫다. net 합 0 불변식 보장은 호출자(칩 원장 집계) 몫이다.
 */

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
  // net 0은 정산 대상이 아니다. 입력은 변형하지 않고 로컬 사본으로만 계산한다.
  const debtors: Party[] = rows
    .filter((row) => row.net < 0)
    .sort((a, b) => a.net - b.net || compareId(a.userId, b.userId))
    .map((row) => ({ id: row.userId, remaining: -row.net }))
  const creditors: Party[] = rows
    .filter((row) => row.net > 0)
    .sort((a, b) => b.net - a.net || compareId(a.userId, b.userId))
    .map((row) => ({ id: row.userId, remaining: row.net }))

  // 로컬 accumulator — 함수 밖으로 새지 않음
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
    // 매 이체마다 최소 한쪽이 소진되므로 이체 수 <= 인원-1 이 보장된다.
    if (debtor.remaining === 0) debtorIndex += 1
    if (creditor.remaining === 0) creditorIndex += 1
  }
  return transfers
}

function compareId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
