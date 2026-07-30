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
