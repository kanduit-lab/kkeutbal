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
    return fail('errors.walletLoadFailed')
  }
}

const adminAdjustCreditsSchema = z.object({
  requestId: z.string().uuid(),
  targetUserId: z.string().uuid(),
  amount: z
    .number()
    .int()
    .min(-1_000_000)
    .max(1_000_000)
    .refine((amount) => amount !== 0),
  reason: z.string().trim().min(1).max(200),
})

export async function adminAdjustCredits(
  input: z.infer<typeof adminAdjustCreditsSchema>,
): Promise<ActionResult<{ transactionId: string; targetUserId: string }>> {
  const adminId = await currentUserId()
  if (!adminId) return fail('errors.loginRequired')
  if (!(await isAdminUser(adminId))) return fail('errors.walletAdminOnly')

  const parsed = adminAdjustCreditsSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')
  const { requestId, targetUserId, amount, reason } = parsed.data

  try {
    return await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1)
      if (!target) return fail('errors.walletTargetNotFound')

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
        transaction && typeof transaction.transactionId === 'string'
          ? transaction.transactionId
          : null
      if (!transactionId) throw new Error('credit transaction was not posted')
      return ok({ transactionId, targetUserId })
    })
  } catch (error) {
    console.error('adminAdjustCredits failed:', error)
    return fail('errors.walletAdjustFailed')
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