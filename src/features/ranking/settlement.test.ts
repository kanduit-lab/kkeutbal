import { describe, expect, it } from 'vitest'
import { computeSettlementTransfers } from './settlement'
import type { SettlementTransfer } from './settlement'

interface NetRow {
  readonly userId: string
  readonly net: number
}

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

  it('비영합 입력은 불완전한 정산표 대신 예외를 던진다', () => {
    const rows = [
      { userId: 'creditor', net: 10 },
      { userId: 'debtor', net: -4 },
    ]
    expect(() => computeSettlementTransfers(rows)).toThrow(/net total/)
  })

  it('중복 사용자·빈 id·안전하지 않은 정수를 거부한다', () => {
    expect(() =>
      computeSettlementTransfers([
        { userId: 'a', net: 1 },
        { userId: 'a', net: -1 },
      ]),
    ).toThrow(/unique/)
    expect(() => computeSettlementTransfers([{ userId: ' ', net: 0 }])).toThrow(/empty/)
    expect(() =>
      computeSettlementTransfers([
        { userId: 'a', net: Number.MAX_SAFE_INTEGER + 1 },
        { userId: 'b', net: -(Number.MAX_SAFE_INTEGER + 1) },
      ]),
    ).toThrow(/safe integer/)
  })

  it('안전 정수 범위 판정이 입력 순서에 좌우되지 않는다', () => {
    const max = Number.MAX_SAFE_INTEGER
    const rows = [
      { userId: 'a', net: max },
      { userId: 'b', net: max },
      { userId: 'c', net: -max },
      { userId: 'd', net: -max },
    ]
    // 딴 쪽·잃은 쪽을 따로 누적하지 않으면, 같은 행 묶음인데도 a,b가 붙어 있을 때만
    // 중간 합이 범위를 넘어 예외가 나고 섞어 주면 그냥 통과했다.
    const grouped = () => computeSettlementTransfers(rows)
    const interleaved = () =>
      computeSettlementTransfers([rows[0]!, rows[2]!, rows[1]!, rows[3]!])
    expect(grouped).toThrow(/safe integer/)
    expect(interleaved).toThrow(/safe integer/)
  })

  it('이체 총액은 언제나 딴 사람들의 몫 합과 같다', () => {
    const rows = [
      { userId: 'a', net: 6 },
      { userId: 'b', net: 4 },
      { userId: 'c', net: -5 },
      { userId: 'd', net: -5 },
    ]
    const transfers = computeSettlementTransfers(rows)
    const moved = transfers.reduce((sum, transfer) => sum + transfer.amount, 0)
    expect(moved).toBe(10)
    expect(transfers.every((transfer) => transfer.amount > 0)).toBe(true)
    expect(transfers.every((transfer) => transfer.fromId !== transfer.toId)).toBe(true)
    // 같은 (보내는 사람, 받는 사람) 쌍이 두 번 나오면 안 된다 — 정산표가 이 쌍을
    // React key로 쓰기 때문에 중복되면 행이 조용히 사라진다.
    const pairs = transfers.map((transfer) => `${transfer.fromId}:${transfer.toId}`)
    expect(new Set(pairs).size).toBe(pairs.length)
    expect(transfers.length).toBeLessThanOrEqual(rows.length - 1)
  })

  it('같은 금액을 잃은 사람끼리는 id 순으로 갚는다', () => {
    const transfers = computeSettlementTransfers([
      { userId: 'debtor-b', net: -5 },
      { userId: 'debtor-a', net: -5 },
      { userId: 'creditor', net: 10 },
    ])
    expect(transfers).toEqual([
      { fromId: 'debtor-a', toId: 'creditor', amount: 5 },
      { fromId: 'debtor-b', toId: 'creditor', amount: 5 },
    ])
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