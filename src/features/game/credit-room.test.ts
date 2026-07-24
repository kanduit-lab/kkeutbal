import { describe, expect, it } from 'vitest'
import {
  createRoomCreditLockCommand,
  createRoomCreditSettlementCommand,
  roomCreditLockIdempotencyKey,
  roomCreditSettlementIdempotencyKey,
  type ActiveRoomCreditLock,
} from './credit-room'

const ids = {
  room: '11111111-1111-4111-8111-111111111111',
  round: '22222222-2222-4222-8222-222222222222',
  settlement: '33333333-3333-4333-8333-333333333333',
  firstUser: '44444444-4444-4444-8444-444444444444',
  secondUser: '55555555-5555-4555-8555-555555555555',
  firstAccount: '66666666-6666-4666-8666-666666666666',
  secondAccount: '77777777-7777-4777-8777-777777777777',
  firstBuyIn: '88888888-8888-4888-8888-888888888888',
  secondBuyIn: '99999999-9999-4999-8999-999999999999',
  firstLock: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  secondLock: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  admin: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
}

const locks: readonly ActiveRoomCreditLock[] = [
  {
    lockId: ids.firstLock,
    roomId: ids.room,
    buyInId: ids.firstBuyIn,
    userId: ids.firstUser,
    accountId: ids.firstAccount,
    amount: 100,
  },
  {
    lockId: ids.secondLock,
    roomId: ids.room,
    buyInId: ids.secondBuyIn,
    userId: ids.secondUser,
    accountId: ids.secondAccount,
    amount: 200,
  },
]
const firstLock = locks[0]!

describe('account-credit room commands', () => {
  it('locks a buy-in by moving available balance into locked balance', () => {
    const command = createRoomCreditLockCommand({
      roomId: ids.room,
      buyInId: ids.firstBuyIn,
      userId: ids.firstUser,
      accountId: ids.firstAccount,
      amount: 100,
    })

    expect(command.transaction).toMatchObject({
      kind: 'room_lock',
      idempotencyKey: `credit-room-lock:v1:${ids.room}:${ids.firstBuyIn}`,
      roomId: ids.room,
      roundId: null,
      initiatedBy: ids.firstUser,
    })
    expect(command.transaction.entries).toEqual([
      { account_id: ids.firstAccount, delta_available: -100, delta_locked: 100 },
    ])
  })

  it('settles every lock once and conserves the total final chips', () => {
    const command = createRoomCreditSettlementCommand({
      roomId: ids.room,
      roundId: ids.round,
      settlementId: ids.settlement,
      initiatedBy: ids.admin,
      locks,
      payouts: [
        { userId: ids.firstUser, accountId: ids.firstAccount, amount: 0 },
        { userId: ids.secondUser, accountId: ids.secondAccount, amount: 300 },
      ],
    })

    expect(command.transaction).toMatchObject({
      kind: 'room_settlement',
      idempotencyKey: `credit-room-settlement:v1:${ids.room}:${ids.settlement}`,
      roomId: ids.room,
      roundId: ids.round,
    })
    expect(command.transaction.entries).toEqual([
      { account_id: ids.firstAccount, delta_available: 0, delta_locked: -100 },
      { account_id: ids.secondAccount, delta_available: 300, delta_locked: -200 },
    ])
    expect(command.lockIdsToRelease).toEqual([ids.firstLock, ids.secondLock])
  })

  it('coalesces more than one buy-in from the same account into one ledger entry', () => {
    const extraLock: ActiveRoomCreditLock = {
      ...firstLock,
      lockId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      buyInId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      amount: 50,
    }
    const command = createRoomCreditSettlementCommand({
      roomId: ids.room,
      roundId: null,
      settlementId: ids.settlement,
      initiatedBy: ids.admin,
      locks: [...locks, extraLock],
      payouts: [
        { userId: ids.firstUser, accountId: ids.firstAccount, amount: 350 },
        { userId: ids.secondUser, accountId: ids.secondAccount, amount: 0 },
      ],
    })

    expect(command.transaction.entries).toEqual([
      { account_id: ids.firstAccount, delta_available: 350, delta_locked: -150 },
      { account_id: ids.secondAccount, delta_available: 0, delta_locked: -200 },
    ])
  })

  it('rejects duplicate or foreign locks and any non-conserving payout', () => {
    expect(() =>
      createRoomCreditSettlementCommand({
        roomId: ids.room,
        roundId: null,
        settlementId: ids.settlement,
        initiatedBy: ids.admin,
        locks: [firstLock, firstLock],
        payouts: [{ userId: ids.firstUser, accountId: ids.firstAccount, amount: 200 }],
      }),
    ).toThrow('only be released once')

    expect(() =>
      createRoomCreditSettlementCommand({
        roomId: ids.room,
        roundId: null,
        settlementId: ids.settlement,
        initiatedBy: ids.admin,
        locks: [{ ...firstLock, roomId: ids.round }],
        payouts: [{ userId: ids.firstUser, accountId: ids.firstAccount, amount: 100 }],
      }),
    ).toThrow('another room')

    expect(() =>
      createRoomCreditSettlementCommand({
        roomId: ids.room,
        roundId: null,
        settlementId: ids.settlement,
        initiatedBy: ids.admin,
        locks,
        payouts: [
          { userId: ids.firstUser, accountId: ids.firstAccount, amount: 100 },
          { userId: ids.secondUser, accountId: ids.secondAccount, amount: 199 },
        ],
      }),
    ).toThrow('conserve all locked credits')
  })

  it('rejects a payout to an account that did not lock credits', () => {
    expect(() =>
      createRoomCreditSettlementCommand({
        roomId: ids.room,
        roundId: null,
        settlementId: ids.settlement,
        initiatedBy: ids.admin,
        locks,
        payouts: [
          { userId: ids.firstUser, accountId: ids.firstAccount, amount: 100 },
          { userId: ids.secondUser, accountId: ids.firstAccount, amount: 200 },
        ],
      }),
    ).toThrow('one entry per account')
  })

  it('uses bounded UUID-derived idempotency keys', () => {
    expect(roomCreditLockIdempotencyKey(ids.room, ids.firstBuyIn)).toBe(
      `credit-room-lock:v1:${ids.room}:${ids.firstBuyIn}`,
    )
    expect(roomCreditSettlementIdempotencyKey(ids.room, ids.settlement)).toBe(
      `credit-room-settlement:v1:${ids.room}:${ids.settlement}`,
    )
    expect(() => roomCreditLockIdempotencyKey('not-an-id', ids.firstBuyIn)).toThrow('room ID')
  })
})
