import { and, eq, ne, sql } from 'drizzle-orm'
import { schema } from '@/lib/db'
import type { Tx } from './action-helpers'
import { addSafeChipIntegers, toSafeChipInteger } from './chip-integers'
import { lockRoomCreditBuyIn } from './credit-rpc'
import type { FundingMode } from './funding-mode'

const { roomMembers, chipLedger, buyIns } = schema

/**
 * 방 생성·입장 시 최초 바이인을 세션 원장(`buy_ins`/`chip_ledger`)에 기록하고, 계정 크레딧
 * 재원 방이면 같은 트랜잭션 안에서 `lock_room_credit_buy_in`까지 호출한다. `createRoom`/
 * `joinRoom` 양쪽에서 `createdBy`와 크레딧 RPC의 `initiatedBy`가 항상 같은 사용자(본인)였던
 * 원래 동작을 그대로 유지한다.
 */
export async function recordInitialBuyIn(
  tx: Tx,
  params: { roomId: string; userId: string; amount: number; fundingMode: FundingMode },
): Promise<void> {
  const [initialBuyIn] = await tx
    .insert(buyIns)
    .values({
      roomId: params.roomId,
      userId: params.userId,
      amount: params.amount,
      createdBy: params.userId,
    })
    .returning({ id: buyIns.id })
  if (!initialBuyIn) throw new Error('initial buy-in insert failed')

  await tx.insert(chipLedger).values({
    roomId: params.roomId,
    userId: params.userId,
    delta: params.amount,
    reason: 'buy_in',
    refBuyInId: initialBuyIn.id,
  })

  if (params.fundingMode === 'account_credit') {
    await lockRoomCreditBuyIn(tx, {
      roomId: params.roomId,
      userId: params.userId,
      buyInId: initialBuyIn.id,
      amount: params.amount,
      initiatedBy: params.userId,
    })
  }
}

export type StartingChipsAdjustmentResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: 'errors.startingChipsBelowBalance' }

/**
 * 방장이 시작 칩(`startingChips`)을 바꿀 때, 이미 참여 중인 비관전 멤버들에게 차액을 소급
 * 지급/회수한다(`updateRoomSettings` 전용 — 이 경로는 `fundingMode === 'account_credit'`일 때
 * 호출부가 이미 막아뒀으므로 크레딧 RPC를 호출하지 않는다). 차액이 음수면 감소분이 어떤
 * 멤버의 현재 잔액을 밑돌지 않는지 먼저 검증하고, 하나라도 밑돌면 아무 것도 쓰지 않은 채
 * 실패를 반환한다.
 */
export async function applyStartingChipsAdjustment(
  tx: Tx,
  params: {
    roomId: string
    createdBy: string
    startingChips: number
    previousStartingChips: number
  },
): Promise<StartingChipsAdjustmentResult> {
  const delta = params.startingChips - params.previousStartingChips
  const targets = await tx
    .select({
      userId: roomMembers.userId,
      balance: sql<string>`(
        select coalesce(sum(${chipLedger.delta}), 0)::text from ${chipLedger}
        where ${chipLedger.roomId} = ${params.roomId}
          and ${chipLedger.userId} = ${roomMembers.userId}
      )`,
    })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, params.roomId), ne(roomMembers.role, 'observer')))

  if (
    delta < 0 &&
    targets.some(
      (member) =>
        addSafeChipIntegers(
          toSafeChipInteger(member.balance, 'Starting-chip adjustment balance'),
          delta,
          'Starting-chip adjusted balance',
        ) < 0,
    )
  ) {
    return { ok: false, error: 'errors.startingChipsBelowBalance' }
  }

  if (targets.length > 0) {
    const adjustments = await tx
      .insert(buyIns)
      .values(
        targets.map((member) => ({
          roomId: params.roomId,
          userId: member.userId,
          amount: delta,
          createdBy: params.createdBy,
        })),
      )
      .returning({ id: buyIns.id, userId: buyIns.userId })
    const adjustmentByUser = new Map(
      adjustments.map((adjustment) => [adjustment.userId, adjustment.id]),
    )
    await tx.insert(chipLedger).values(
      targets.map((member) => {
        const refBuyInId = adjustmentByUser.get(member.userId)
        if (!refBuyInId) throw new Error('buy-in adjustment insert failed')
        return {
          roomId: params.roomId,
          userId: member.userId,
          delta,
          reason: 'buy_in' as const,
          refBuyInId,
        }
      }),
    )
  }

  return { ok: true }
}
