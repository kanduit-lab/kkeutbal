import { sql } from 'drizzle-orm'
import type { Tx } from './action-helpers'

/**
 * 전역 가상 크레딧 RPC 래퍼 — `docs/10-virtual-credit-and-fair-play.md`가 정한 대로 앱 롤은
 * `post_credit_transaction` primitive를 직접 못 부르고, 이 SECURITY DEFINER 함수들만 호출한다.
 * 인자 순서·타입 캐스팅은 DB 함수 시그니처와 정확히 맞아야 하므로 호출부마다 SQL을 반복하지
 * 않고 여기 한 곳에 모은다. 반드시 세션 buy_ins/chip_ledger INSERT와 같은 `db.transaction` 안에서
 * 호출해야 한다 — 트랜잭션 밖으로 옮기면 크레딧 정합성이 깨진다.
 */

export interface LockRoomCreditBuyInParams {
  readonly roomId: string
  readonly userId: string
  readonly buyInId: string
  readonly amount: number
  readonly initiatedBy: string
}

export async function lockRoomCreditBuyIn(
  tx: Tx,
  params: LockRoomCreditBuyInParams,
): Promise<void> {
  await tx.execute(sql`
    select public.lock_room_credit_buy_in(
      ${params.roomId}::uuid,
      ${params.userId}::uuid,
      ${params.buyInId}::uuid,
      ${params.amount}::bigint,
      ${params.initiatedBy}::uuid
    )
  `)
}

export async function settleRoomCredits(
  tx: Tx,
  roomId: string,
  settledBy: string,
): Promise<void> {
  await tx.execute(sql`
    select public.settle_room_credits(${roomId}::uuid, ${settledBy}::uuid)
  `)
}

/**
 * `post_credit_transaction`이 available 잔액을 음수로 만드는 항목을 거부할 때 던지는 예외인지
 * 판정한다(`0009_virtual_credits_security.sql`).
 *
 * 이 예외를 그냥 catch로 흘리면 화면에는 "입장에 실패했습니다"·"방 생성에 실패했습니다"처럼
 * 원인 없는 문구만 뜬다. 크레딧이 모자란 것은 사용자가 바로 고칠 수 있는 상태이므로 그대로
 * 알려준다. 문자열 비교인 이유는 이 예외가 `raise exception`이라 SQLSTATE가 일반값(P0001)뿐이고,
 * 그 코드로는 같은 함수의 다른 실패와 구분되지 않기 때문이다.
 */
export function isInsufficientCreditError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const message = (error as { message?: unknown }).message
  return typeof message === 'string' && message.includes('insufficient virtual credit')
}
