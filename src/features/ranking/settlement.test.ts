import { describe, expect, it } from 'vitest'
import { computeSettlementTransfers } from './settlement'
import type { SettlementTransfer } from './settlement'

/**
 * 정산 이체 계산 테스트.
 *
 * 핵심 불변식: net 합이 0인 입력이면 이체를 모두 적용했을 때 전원 잔액 0,
 * 이체 수는 인원-1 이하, 출력은 입력 순서와 무관하게 결정적.
 */

interface NetRow {
  readonly userId: string
  readonly net: number
}

/** 이체를 적용한 뒤 남는 잔액 — 채무자는 net + 지불액, 채권자는 net - 수령액. */
function residualNets(
  rows: readonly NetRow[],
  transfers: readonly SettlementTransfer[],
): Map<string, number> {
  const residual = new Map(rows.map((row) => [row.userId, row.net]))
  for (const transfer of transfers) {
    residual.set(transfer.fromId, (residual.get(transfer.fromId) ?? 0) + transfer.amount)
    residual.set(transfer.toId, (residual.get(transfer.toId) ?? 0) - transfer.amount)
  }
  return residual
}

describe('computeSettlementTransfers', () => {
  it('빈 입력이면 빈 배열을 돌려준다', () => {
    expect(computeSettlementTransfers([])).toEqual([])
  })

  it('전원 0이면 이체가 없다', () => {
    const rows = [
      { userId: 'a', net: 0 },
      { userId: 'b', net: 0 },
    ]
    expect(computeSettlementTransfers(rows)).toEqual([])
  })

  it('2인 정산 — 잃은 쪽이 딴 쪽에게 전액을 보낸다', () => {
    const rows = [
      { userId: 'winner', net: 5_000 },
      { userId: 'loser', net: -5_000 },
    ]
    expect(computeSettlementTransfers(rows)).toEqual([
      { fromId: 'loser', toId: 'winner', amount: 5_000 },
    ])
  })

  it('net 0인 참가자는 이체에 등장하지 않는다', () => {
    const rows = [
      { userId: 'a', net: 3_000 },
      { userId: 'even', net: 0 },
      { userId: 'b', net: -3_000 },
    ]
    const transfers = computeSettlementTransfers(rows)
    const ids = transfers.flatMap((t) => [t.fromId, t.toId])
    expect(ids).not.toContain('even')
  })

  it('합 0 입력 — 이체 적용 후 전원 잔액 0, 모든 금액 양수', () => {
    const rows = [
      { userId: 'a', net: 7_200 },
      { userId: 'b', net: -3_100 },
      { userId: 'c', net: -5_600 },
      { userId: 'd', net: 1_500 },
      { userId: 'e', net: 0 },
    ]
    const transfers = computeSettlementTransfers(rows)

    for (const amount of transfers.map((t) => t.amount)) {
      expect(amount).toBeGreaterThan(0)
    }
    for (const residual of residualNets(rows, transfers).values()) {
      expect(residual).toBe(0)
    }
  })

  it('이체 수는 인원-1 이하다', () => {
    const rows = [
      { userId: 'a', net: 10 },
      { userId: 'b', net: 10 },
      { userId: 'c', net: -10 },
      { userId: 'd', net: -10 },
    ]
    expect(computeSettlementTransfers(rows).length).toBeLessThanOrEqual(rows.length - 1)
  })

  it('동률은 userId 오름차순으로 깨진다', () => {
    const rows = [
      { userId: 'creditor-b', net: 5 },
      { userId: 'creditor-a', net: 5 },
      { userId: 'debtor', net: -10 },
    ]
    expect(computeSettlementTransfers(rows)).toEqual([
      { fromId: 'debtor', toId: 'creditor-a', amount: 5 },
      { fromId: 'debtor', toId: 'creditor-b', amount: 5 },
    ])
  })

  it('입력 순서를 바꿔도 결과가 같다 (결정성)', () => {
    const rows = [
      { userId: 'a', net: 7_200 },
      { userId: 'b', net: -3_100 },
      { userId: 'c', net: -5_600 },
      { userId: 'd', net: 1_500 },
    ]
    const shuffled = [rows[2]!, rows[0]!, rows[3]!, rows[1]!]
    expect(computeSettlementTransfers(shuffled)).toEqual(computeSettlementTransfers(rows))
  })

  it('가장 큰 채무자가 가장 큰 채권자에게 먼저 보낸다', () => {
    const rows = [
      { userId: 'big-winner', net: 9 },
      { userId: 'small-winner', net: 1 },
      { userId: 'big-loser', net: -8 },
      { userId: 'small-loser', net: -2 },
    ]
    const transfers = computeSettlementTransfers(rows)
    expect(transfers[0]).toEqual({ fromId: 'big-loser', toId: 'big-winner', amount: 8 })
  })

  it('비영합 입력 — 상계 가능한 만큼만 정산하고 나머지는 남긴다 (던지지 않음)', () => {
    // 선택한 동작: 데이터가 어긋나도(net 합 != 0) 결과 화면이 죽지 않도록
    // 맞아떨어지는 부분만 정산한다. 남은 잔액은 이체 없이 그대로 둔다.
    const rows = [
      { userId: 'creditor', net: 10 },
      { userId: 'debtor', net: -4 },
    ]
    const transfers = computeSettlementTransfers(rows)
    expect(transfers).toEqual([{ fromId: 'debtor', toId: 'creditor', amount: 4 }])

    const residual = residualNets(rows, transfers)
    expect(residual.get('debtor')).toBe(0)
    expect(residual.get('creditor')).toBe(6)
  })

  it('입력 배열과 행을 변형하지 않는다', () => {
    const rows = [
      { userId: 'a', net: 5 },
      { userId: 'b', net: -5 },
    ]
    const snapshot = rows.map((row) => ({ ...row }))
    computeSettlementTransfers(rows)
    expect(rows).toEqual(snapshot)
  })
})
