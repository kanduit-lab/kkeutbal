import { describe, expect, it } from 'vitest'
import { carrySharesFromLedger, collectableCarry, readPendingCarry } from './round-carry'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const ROUND = '44444444-4444-4444-8444-444444444444'

describe('carrySharesFromLedger', () => {
  it('sums bet rows per user and ignores non-bet rows', () => {
    const carry = carrySharesFromLedger(
      [
        { id: 'l1', userId: A, delta: -100, reason: 'bet' },
        { id: 'l2', userId: A, delta: -200, reason: 'bet' },
        { id: 'l3', userId: B, delta: -300, reason: 'bet' },
        { id: 'l4', userId: B, delta: 1_000, reason: 'pot_win' },
        { id: 'l5', userId: C, delta: -5_000, reason: 'buy_in' },
      ],
      new Set(),
    )
    expect(carry).toEqual({ total: 600, byUser: { [A]: 300, [B]: 300 } })
  })

  it('drops bet rows that were already reverted', () => {
    const carry = carrySharesFromLedger(
      [
        { id: 'l1', userId: A, delta: -100, reason: 'bet' },
        { id: 'l2', userId: B, delta: -300, reason: 'bet' },
      ],
      new Set(['l2']),
    )
    expect(carry).toEqual({ total: 100, byUser: { [A]: 100 } })
  })

  it('returns null when nothing was in the pot', () => {
    expect(carrySharesFromLedger([], new Set())).toBeNull()
    expect(
      carrySharesFromLedger([{ id: 'l1', userId: A, delta: -100, reason: 'bet' }], new Set(['l1'])),
    ).toBeNull()
  })
})

describe('readPendingCarry', () => {
  it('reads a carry that has not been consumed', () => {
    expect(readPendingCarry({ note: '재경기', carry: { total: 300, byUser: { [A]: 300 } } })).toEqual(
      { total: 300, byUser: { [A]: 300 } },
    )
  })

  it('ignores a carry already collected by a later round', () => {
    expect(
      readPendingCarry({
        carry: { total: 300, byUser: { [A]: 300 } },
        carryConsumedBy: ROUND,
      }),
    ).toBeNull()
  })

  it('ignores rounds voided for other reasons and malformed blobs', () => {
    expect(readPendingCarry({ note: '오입력' })).toBeNull()
    expect(readPendingCarry(null)).toBeNull()
    expect(readPendingCarry({ carry: { total: -5, byUser: {} } })).toBeNull()
    expect(readPendingCarry({ carry: { total: 300, byUser: { 'not-a-uuid': 300 } } })).toBeNull()
  })
})

describe('collectableCarry', () => {
  const carries = [{ total: 600, byUser: { [A]: 300, [B]: 300 } }]

  it('collects each carried share from the new round participants', () => {
    expect(
      collectableCarry({
        carries,
        participantIds: [A, B],
        balanceByUser: new Map([
          [A, 10_000],
          [B, 10_000],
        ]),
      }),
    ).toEqual([
      { userId: A, amount: 300 },
      { userId: B, amount: 300 },
    ])
  })

  it('skips people who left or turned observer before the next round', () => {
    expect(
      collectableCarry({
        carries,
        participantIds: [A],
        balanceByUser: new Map([[A, 10_000]]),
      }),
    ).toEqual([{ userId: A, amount: 300 }])
  })

  it('never collects more than the player still has', () => {
    expect(
      collectableCarry({
        carries,
        participantIds: [A, B],
        balanceByUser: new Map([
          [A, 120],
          [B, 0],
        ]),
      }),
    ).toEqual([{ userId: A, amount: 120 }])
  })

  it('merges shares when several voided rounds carry into one', () => {
    expect(
      collectableCarry({
        carries: [
          { total: 300, byUser: { [A]: 300 } },
          { total: 100, byUser: { [A]: 100 } },
        ],
        participantIds: [A],
        balanceByUser: new Map([[A, 10_000]]),
      }),
    ).toEqual([{ userId: A, amount: 400 }])
  })
})
