import { type CreditEntryRequest, validateCreditEntries } from '../wallet/ledger'

/**
 * 계정 크레딧 방의 DB posting 전용 순수 명령 구성기.
 *
 * 방 안의 칩은 전역 원장 잔액이 아니다. 참가비는 먼저 `available -> locked`로 옮기고,
 * 방을 종료할 때 모든 lock을 한 거래에서 `locked -> available`로 되돌리며 최종 칩
 * 분배를 반영한다. 실제 행 잠금·음수 잔액 방지는 `post_credit_transaction` DB 함수의
 * 책임이고, 이 모듈은 호출자가 잘못된 거래를 만들지 못하게 하는 도메인 경계다.
 */

export interface RoomCreditLockInput {
  readonly roomId: string
  readonly buyInId: string
  readonly userId: string
  readonly accountId: string
  readonly amount: number
}

/** `room_credit_locks`에서 읽은, 아직 release 되지 않은 lock의 필요한 부분이다. */
export interface ActiveRoomCreditLock extends RoomCreditLockInput {
  readonly lockId: string
}

/** 방 종료 시 lock을 가진 계정마다 하나씩 제출하는 최종 칩 분배다. */
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
  /** 종료 판과 연결할 수 있으나, 방 자체 종료 정산에는 null을 사용한다. */
  readonly roundId: string | null
  readonly reason: string
  readonly snapshot: Readonly<Record<string, unknown>>
  readonly entries: readonly CreditEntryRequest[]
}

export interface RoomCreditLockCommand {
  readonly transaction: RoomCreditPostingRequest
  /** posting 성공 뒤 `room_credit_locks`에 저장할 불변 근거다. */
  readonly lock: RoomCreditLockInput
}

export interface RoomCreditSettlementCommand {
  readonly transaction: RoomCreditPostingRequest
  /** posting 성공과 같은 DB 트랜잭션에서 released_transaction_id를 채울 lock ID 목록이다. */
  readonly lockIdsToRelease: readonly string[]
}

export interface RoomCreditSettlementInput {
  readonly roomId: string
  /** 방을 닫는 마지막 판이 있으면 연결해 감사 추적을 강화한다. */
  readonly roundId: string | null
  readonly settlementId: string
  readonly initiatedBy: string
  readonly locks: readonly ActiveRoomCreditLock[]
  readonly payouts: readonly RoomCreditPayout[]
}

/**
 * 같은 buy-in은 재시도해도 반드시 동일한 거래로 수렴한다.
 * 멱등키는 인증 수단이 아니므로, 서버 액션에서 방 멤버십·buy-in 소유권도 별도로 검증해야 한다.
 */
export function roomCreditLockIdempotencyKey(roomId: string, buyInId: string): string {
  assertUuid(roomId, 'room ID')
  assertUuid(buyInId, 'buy-in ID')
  return `credit-room-lock:v1:${roomId}:${buyInId}`
}

/**
 * 하나의 방 종료 요청은 UUID settlementId 하나에만 대응한다. 네트워크 재시도에는 같은 ID를
 * 사용하고, 이미 종료된 방을 새 settlementId로 다시 정산하는 일은 서버 액션이 거부해야 한다.
 */
export function roomCreditSettlementIdempotencyKey(roomId: string, settlementId: string): string {
  assertUuid(roomId, 'room ID')
  assertUuid(settlementId, 'settlement ID')
  return `credit-room-settlement:v1:${roomId}:${settlementId}`
}

/**
 * 전역 available 잔액에서 방 참가비를 lock한다. 한 계정 엔트리 안에서 available 감소와
 * locked 증가가 상쇄되므로 발행·소각 없이 잔액 보존이 성립한다.
 */
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

/**
 * 모든 방 lock을 한 원장 거래로 해제하면서 최종 칩을 계정 잔액으로 옮긴다.
 * payout 총합은 lock 총합과 같아야 하며, lock이 없는 계정으로 지급하거나 같은 lock을 두 번
 * 해제할 수 없다. 여러 buy-in이 같은 계정에 속해도 DB의 "한 거래당 한 계정 엔트리" 제약에
 * 맞게 하나의 엔트리로 합친다.
 */
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
    if (!Number.isSafeInteger(nextLockedAmount)) throw new Error('Room credit lock total is too large')
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
