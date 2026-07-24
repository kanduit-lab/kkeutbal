'use server'

import { desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { db, schema } from '@/lib/db'
import { isAdminUser } from '../auth/roles'
import { currentUserId } from '../auth/session'

const WALLET_HISTORY_LIMIT = 50

const { creditAccounts, creditEntries, creditTransactions, users } = schema

export interface CreditWalletSnapshot {
  readonly availableBalance: number
  readonly lockedBalance: number
  readonly totalBalance: number
  readonly transactions: readonly CreditTransactionView[]
}

export interface CreditTransactionView {
  readonly id: string
  readonly kind: 'admin_grant' | 'admin_revoke' | 'room_lock' | 'room_settlement' | 'correction'
  readonly reason: string
  readonly deltaAvailable: number
  readonly deltaLocked: number
  readonly availableAfter: number
  readonly lockedAfter: number
  readonly roomId: string | null
  readonly roundId: string | null
  readonly createdAt: string
}

/**
 * 내 가상 크레딧과 변경 불가 이력. 처음 조회하는 계정은 0 잔액 지갑만 lazy creation 한다.
 * 지급은 이 함수가 아니라 관리자 조정 거래만 할 수 있다.
 */
export async function getMyCreditWallet(): Promise<ActionResult<CreditWalletSnapshot>> {
  const userId = await currentUserId()
  if (!userId) return fail('errors.loginRequired')

  try {
    return await db.transaction(async (tx) => {
      await ensureCreditAccount(tx, userId)
      const snapshot = await getCreditWalletSnapshot(tx, userId)
      if (!snapshot) throw new Error('credit account was not created')
      return ok(snapshot)
    })
  } catch (error) {
    console.error('getMyCreditWallet failed:', error)
    return fail('가상 크레딧을 조회하지 못했습니다')
  }
}

const adminAdjustCreditsSchema = z.object({
  /** 클라이언트가 한 번 생성해 재시도에도 유지하는 UUID. */
  requestId: z.string().uuid(),
  targetUserId: z.string().uuid(),
  /** 양수=지급, 음수=회수. 0은 허용하지 않는다. */
  amount: z.number().int().min(-1_000_000).max(1_000_000).refine((amount) => amount !== 0),
  reason: z.string().trim().min(1).max(200),
})

/**
 * 관리자 가상 크레딧 지급/회수. 서버는 인증·입력 경계만 맡고, 발행 계정과 대상 계정의
 * 복식 엔트리 구성·posting은 DB 전용 RPC가 원자적으로 수행한다. 회수의 음수 잔액도 DB가 거부한다.
 */
export async function adminAdjustCredits(
  input: z.infer<typeof adminAdjustCreditsSchema>,
): Promise<ActionResult<{ transactionId: string; targetUserId: string }>> {
  const adminId = await currentUserId()
  if (!adminId) return fail('errors.loginRequired')
  if (!(await isAdminUser(adminId))) return fail('관리자만 가상 크레딧을 조정할 수 있습니다')

  const parsed = adminAdjustCreditsSchema.safeParse(input)
  if (!parsed.success) return fail('입력값이 올바르지 않습니다')
  const { requestId, targetUserId, amount, reason } = parsed.data

  try {
    return await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1)
      if (!target) return fail('대상 사용자를 찾을 수 없습니다')

      const [transaction] = await tx.execute(sql<{ transactionId: string }>`
        select public.admin_adjust_credit(
          ${targetUserId}::uuid,
          ${amount}::bigint,
          ${reason}::text,
          ${requestId}::text,
          ${adminId}::uuid
        ) as "transactionId"
      `)
      const transactionId =
        transaction && typeof transaction.transactionId === 'string' ? transaction.transactionId : null
      if (!transactionId) throw new Error('credit transaction was not posted')
      return ok({ transactionId, targetUserId })
    })
  } catch (error) {
    console.error('adminAdjustCredits failed:', error)
    return fail('가상 크레딧 조정에 실패했습니다. 잔액과 사유를 확인하세요')
  }
}

async function ensureCreditAccount(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
): Promise<string> {
  await tx.execute(sql`select public.ensure_credit_account(${userId}::uuid)`)
  const [account] = await tx
    .select({ id: creditAccounts.id })
    .from(creditAccounts)
    .where(eq(creditAccounts.userId, userId))
    .limit(1)
  if (!account) throw new Error('credit account was not found')
  return account.id
}

async function getCreditWalletSnapshot(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
): Promise<CreditWalletSnapshot | null> {
  const [account] = await tx
    .select({
      id: creditAccounts.id,
      availableBalance: creditAccounts.availableBalance,
      lockedBalance: creditAccounts.lockedBalance,
    })
    .from(creditAccounts)
    .where(eq(creditAccounts.userId, userId))
    .limit(1)
  if (!account) return null

  const entries = await tx
    .select({
      id: creditTransactions.id,
      kind: creditTransactions.kind,
      reason: creditTransactions.reason,
      deltaAvailable: creditEntries.deltaAvailable,
      deltaLocked: creditEntries.deltaLocked,
      availableAfter: creditEntries.availableAfter,
      lockedAfter: creditEntries.lockedAfter,
      roomId: creditTransactions.roomId,
      roundId: creditTransactions.roundId,
      createdAt: creditEntries.createdAt,
    })
    .from(creditEntries)
    .innerJoin(creditTransactions, eq(creditTransactions.id, creditEntries.transactionId))
    .where(eq(creditEntries.accountId, account.id))
    .orderBy(desc(creditEntries.createdAt), desc(creditEntries.id))
    .limit(WALLET_HISTORY_LIMIT)

  return {
    availableBalance: account.availableBalance,
    lockedBalance: account.lockedBalance,
    totalBalance: account.availableBalance + account.lockedBalance,
    transactions: entries.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      reason: entry.reason,
      deltaAvailable: entry.deltaAvailable,
      deltaLocked: entry.deltaLocked,
      availableAfter: entry.availableAfter,
      lockedAfter: entry.lockedAfter,
      roomId: entry.roomId,
      roundId: entry.roundId,
      createdAt: entry.createdAt.toISOString(),
    })),
  }
}
