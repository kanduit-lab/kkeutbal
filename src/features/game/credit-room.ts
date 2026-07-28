import { type CreditEntryRequest, validateCreditEntries } from '../wallet/ledger'

export interface RoomCreditLockInput {
  readonly roomId: string
  readonly buyInId: string
  readonly userId: string
  readonly accountId: string
  readonly amount: number
}

export interface ActiveRoomCreditLock extends RoomCreditLockInput {
  readonly lockId: string
}

export interface RoomCreditPayout {
  readonly userId: string
  readonly accountId: string
  readonly amount: number
}

export interface RoomCreditPostingRequest {
  readonly kind: 'room_lock' | 'room_settlement'
  readonly idempotencyKey: string
  readonly initiatedBy: string
  readonly roomId: string

  readonly roundId: string | null
  readonly reason: string
  readonly snapshot: Readonly<Record<string, unknown>>
  readonly entries: readonly CreditEntryRequest[]
}

export interface RoomCreditLockCommand {
  readonly transaction: RoomCreditPostingRequest

  readonly lock: RoomCreditLockInput
}

export interface RoomCreditSettlementCommand {
  readonly transaction: RoomCreditPostingRequest

  readonly lockIdsToRelease: readonly string[]
}

export interface RoomCreditSettlementInput {
  readonly roomId: string

  readonly roundId: string | null
  readonly settlementId: string
  readonly initiatedBy: string
  readonly locks: readonly ActiveRoomCreditLock[]
  readonly payouts: readonly RoomCreditPayout[]
}

export function roomCreditLockIdempotencyKey(roomId: string, buyInId: string): string {
  assertUuid(roomId, 'room ID')
  assertUuid(buyInId, 'buy-in ID')
  return `credit-room-lock:v1:${roomId}:${buyInId}`
}

export function roomCreditSettlementIdempotencyKey(roomId: string, settlementId: string): string {
  assertUuid(roomId, 'room ID')
  assertUuid(settlementId, 'settlement ID')
  return `credit-room-settlement:v1:${roomId}:${settlementId}`
}

export function createRoomCreditLockCommand(input: RoomCreditLockInput): RoomCreditLockCommand {
  validateLockInput(input)

  const entries = [
    {
      account_id: input.accountId,
      delta_available: -input.amount,
      delta_locked: input.amount,
    },
  ] satisfies readonly CreditEntryRequest[]
  validateCreditEntries(entries)

  return {
    transaction: {
      kind: 'room_lock',
      idempotencyKey: roomCreditLockIdempotencyKey(input.roomId, input.buyInId),
      initiatedBy: input.userId,
      roomId: input.roomId,
      roundId: null,
      reason: '방 참가 크레딧 잠금',
      snapshot: {
        protocol: 'credit-room-lock/v1',
        buyInId: input.buyInId,
        userId: input.userId,
        amount: input.amount,
      },
      entries,
    },
    lock: { ...input },
  }
}

export function createRoomCreditSettlementCommand(
  input: RoomCreditSettlementInput,
): RoomCreditSettlementCommand {
  assertUuid(input.roomId, 'room ID')
  assertOptionalUuid(input.roundId, 'round ID')
  assertUuid(input.settlementId, 'settlement ID')
  assertUuid(input.initiatedBy, 'initiated by user ID')
  if (input.locks.length === 0) throw new Error('Room credit settlement needs active locks')

  const locksByAccount = new Map<string, { userId: string; lockedAmount: number }>()
  const lockIds = new Set<string>()
  let lockedTotal = 0

  for (const lock of input.locks) {
    validateActiveLock(lock, input.roomId)
    if (lockIds.has(lock.lockId)) throw new Error('Room credit lock can only be released once')
    lockIds.add(lock.lockId)

    const existing = locksByAccount.get(lock.accountId)
    if (existing && existing.userId !== lock.userId) {
      throw new Error('A credit account must belong to one room user')
    }
    const nextLockedAmount = (existing?.lockedAmount ?? 0) + lock.amount
    if (!Number.isSafeInteger(nextLockedAmount))
      throw new Error('Room credit lock total is too large')
    locksByAccount.set(lock.accountId, { userId: lock.userId, lockedAmount: nextLockedAmount })

    lockedTotal += lock.amount
    if (!Number.isSafeInteger(lockedTotal)) throw new Error('Room credit lock total is too large')
  }

  const payoutsByAccount = new Map<string, number>()
  let payoutTotal = 0
  for (const payout of input.payouts) {
    validatePayout(payout)
    if (payoutsByAccount.has(payout.accountId)) {
      throw new Error('Room credit payout needs one entry per account')
    }

    const lockOwner = locksByAccount.get(payout.accountId)
    if (!lockOwner || lockOwner.userId !== payout.userId) {
      throw new Error('Room credit payout must belong to an active room lock')
    }
    payoutsByAccount.set(payout.accountId, payout.amount)
    payoutTotal += payout.amount
    if (!Number.isSafeInteger(payoutTotal)) throw new Error('Room credit payout total is too large')
  }

  if (payoutsByAccount.size !== locksByAccount.size) {
    throw new Error('Room credit settlement must include every locked account')
  }
  if (payoutTotal !== lockedTotal) {
    throw new Error('Room credit payouts must conserve all locked credits')
  }

  const entries = [...locksByAccount.entries()].map(([accountId, lock]) => ({
    account_id: accountId,
    delta_available: payoutsByAccount.get(accountId) ?? 0,
    delta_locked: -lock.lockedAmount,
  }))
  validateCreditEntries(entries)

  return {
    transaction: {
      kind: 'room_settlement',
      idempotencyKey: roomCreditSettlementIdempotencyKey(input.roomId, input.settlementId),
      initiatedBy: input.initiatedBy,
      roomId: input.roomId,
      roundId: input.roundId,
      reason: '방 종료 크레딧 정산',
      snapshot: {
        protocol: 'credit-room-settlement/v1',
        settlementId: input.settlementId,
        lockIds: [...lockIds],
        lockedTotal,
        payouts: input.payouts.map((payout) => ({ ...payout })),
      },
      entries,
    },
    lockIdsToRelease: [...lockIds],
  }
}

function validateLockInput(input: RoomCreditLockInput): void {
  assertUuid(input.roomId, 'room ID')
  assertUuid(input.buyInId, 'buy-in ID')
  assertUuid(input.userId, 'user ID')
  assertUuid(input.accountId, 'credit account ID')
  assertPositiveAmount(input.amount, 'Room credit lock amount')
}

function validateActiveLock(lock: ActiveRoomCreditLock, roomId: string): void {
  validateLockInput(lock)
  assertUuid(lock.lockId, 'room credit lock ID')
  if (lock.roomId !== roomId) throw new Error('Room credit lock belongs to another room')
}

function validatePayout(payout: RoomCreditPayout): void {
  assertUuid(payout.userId, 'payout user ID')
  assertUuid(payout.accountId, 'payout credit account ID')
  if (!Number.isSafeInteger(payout.amount) || payout.amount < 0) {
    throw new Error('Room credit payout must be a nonnegative safe integer')
  }
}

function assertPositiveAmount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`)
  }
}

function assertOptionalUuid(value: string | null, label: string): void {
  if (value !== null) assertUuid(value, label)
}

function assertUuid(value: string, label: string): void {
  if (!UUID_PATTERN.test(value)) throw new Error(`${label} must be a UUID`)
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i