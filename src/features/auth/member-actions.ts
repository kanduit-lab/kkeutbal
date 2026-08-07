'use server'

import bcrypt from 'bcryptjs'
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { db, schema } from '@/lib/db'
import { displayNameSchema } from './schemas'
import { currentUserId } from './session'
import { isAdminUser } from './roles'
import type { MemberBulkFailure, MemberBulkResult, MemberDetail } from './member-types'

const { creditAccounts, creditEntries, creditTransactions, roomMembers, rooms, users } = schema

const BULK_LIMIT = 100
const DETAIL_HISTORY_LIMIT = 20
const TEMP_PASSWORD_LENGTH = 14

async function requireAdmin(): Promise<{ adminId: string } | { error: string }> {
  const adminId = await currentUserId()
  if (!adminId) return { error: 'errors.loginRequired' }
  if (!(await isAdminUser(adminId))) return { error: 'errors.adminOnlyChange' }
  return { adminId }
}

function isGuestSub(authentikSub: string): boolean {
  return authentikSub.startsWith('guest:')
}

/** 회원가입(`actions.ts`)과 같은 규칙. 여기서는 비우는 것도 허용한다. */
const phoneSchema = z
  .string()
  .transform((value) => value.replace(/\D/g, ''))
  .pipe(z.string().regex(/^01[016789]\d{7,8}$/))

const reasonSchema = z.string().trim().min(1).max(200)

// ── 상세 조회 ────────────────────────────────────────────────────────────────

const memberDetailSchema = z.object({ targetUserId: z.string().uuid() })

export async function getMemberDetail(
  input: z.infer<typeof memberDetailSchema>,
): Promise<ActionResult<MemberDetail>> {
  const guard = await requireAdmin()
  if ('error' in guard) return fail(guard.error)

  const parsed = memberDetailSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')
  const { targetUserId } = parsed.data

  try {
    const [row] = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        username: users.username,
        phone: users.phone,
        authentikSub: users.authentikSub,
        passwordHash: users.passwordHash,
        isAdmin: users.isAdmin,
        isManaged: users.isManaged,
        status: users.status,
        statusReason: users.statusReason,
        statusChangedAt: users.statusChangedAt,
        statusChangedBy: users.statusChangedBy,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1)
    if (!row) return fail('errors.adminUserNotFound')

    const [account] = await db
      .select({
        id: creditAccounts.id,
        availableBalance: creditAccounts.availableBalance,
        lockedBalance: creditAccounts.lockedBalance,
      })
      .from(creditAccounts)
      .where(eq(creditAccounts.userId, targetUserId))
      .limit(1)

    const [transactions, roomStats, actor] = await Promise.all([
      account
        ? db
            .select({
              id: creditTransactions.id,
              kind: creditTransactions.kind,
              reason: creditTransactions.reason,
              deltaAvailable: creditEntries.deltaAvailable,
              deltaLocked: creditEntries.deltaLocked,
              availableAfter: creditEntries.availableAfter,
              createdAt: creditEntries.createdAt,
            })
            .from(creditEntries)
            .innerJoin(creditTransactions, eq(creditTransactions.id, creditEntries.transactionId))
            .where(eq(creditEntries.accountId, account.id))
            .orderBy(desc(creditEntries.createdAt), desc(creditEntries.id))
            .limit(DETAIL_HISTORY_LIMIT)
        : Promise.resolve([]),
      db
        .select({
          joined: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (
            where ${roomMembers.leftAt} is null and ${rooms.status} in ('waiting', 'playing')
          )::int`,
          hosted: sql<number>`count(*) filter (where ${rooms.hostId} = ${targetUserId})::int`,
        })
        .from(roomMembers)
        .innerJoin(rooms, eq(rooms.id, roomMembers.roomId))
        .where(eq(roomMembers.userId, targetUserId)),
      row.statusChangedBy
        ? db
            .select({ displayName: users.displayName })
            .from(users)
            .where(eq(users.id, row.statusChangedBy))
            .limit(1)
        : Promise.resolve([]),
    ])

    const stats = roomStats[0]
    const guest = isGuestSub(row.authentikSub)
    return ok({
      id: row.id,
      displayName: row.displayName,
      username: row.username,
      phoneMasked: row.phone ? `****${row.phone.slice(-4)}` : null,
      isAdmin: row.isAdmin,
      isGuest: guest,
      isManaged: row.isManaged,
      hasPassword: row.passwordHash !== null,
      authType: guest ? 'guest' : row.username ? 'internal' : 'sso',
      status: row.status,
      statusReason: row.statusReason,
      statusChangedAt: row.statusChangedAt?.toISOString() ?? null,
      statusChangedByName: actor[0]?.displayName ?? null,
      createdAt: row.createdAt.toISOString(),
      availableBalance: account?.availableBalance ?? 0,
      lockedBalance: account?.lockedBalance ?? 0,
      roomsJoined: stats?.joined ?? 0,
      roomsActive: stats?.active ?? 0,
      roomsHosted: stats?.hosted ?? 0,
      transactions: transactions.map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        reason: entry.reason,
        deltaAvailable: entry.deltaAvailable,
        deltaLocked: entry.deltaLocked,
        availableAfter: entry.availableAfter,
        createdAt: entry.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('getMemberDetail failed:', error)
    return fail('errors.memberDetailLoadFailed')
  }
}

// ── 프로필 편집 ──────────────────────────────────────────────────────────────

const updateProfileSchema = z.object({
  targetUserId: z.string().uuid(),
  displayName: displayNameSchema,
  phone: z.union([phoneSchema, z.literal('')]),
})

export async function updateMemberProfile(
  input: z.infer<typeof updateProfileSchema>,
): Promise<ActionResult<{ targetUserId: string; displayName: string }>> {
  const guard = await requireAdmin()
  if ('error' in guard) return fail(guard.error)

  const parsed = updateProfileSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')
  const { targetUserId, displayName, phone } = parsed.data

  try {
    const [target] = await db
      .select({ authentikSub: users.authentikSub, status: users.status })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1)
    if (!target) return fail('errors.adminUserNotFound')
    if (target.status === 'deleted') return fail('errors.memberDeletedImmutable')
    // 게스트 이름은 입장 토큰과 함께 sub에 묶여 있어 바꾸면 신원이 어긋난다.
    if (isGuestSub(target.authentikSub)) return fail('errors.guestProfileImmutable')

    const nextPhone = phone === '' ? null : phone
    if (nextPhone) {
      const [taken] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.phone, nextPhone), ne(users.id, targetUserId)))
        .limit(1)
      if (taken) return fail('errors.memberPhoneTaken')
    }

    await db.update(users).set({ displayName, phone: nextPhone }).where(eq(users.id, targetUserId))
    return ok({ targetUserId, displayName })
  } catch (error) {
    console.error('updateMemberProfile failed:', error)
    return fail('errors.memberProfileUpdateFailed')
  }
}

// ── 비밀번호 초기화 ──────────────────────────────────────────────────────────

/** 구두·메모 전달을 전제로 혼동하기 쉬운 글자(0/O, 1/l/I)를 뺐다. */
const TEMP_PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateTempPassword(): string {
  const values = new Uint32Array(TEMP_PASSWORD_LENGTH)
  crypto.getRandomValues(values)
  return Array.from(
    values,
    (value) => TEMP_PASSWORD_ALPHABET[value % TEMP_PASSWORD_ALPHABET.length],
  ).join('')
}

const resetPasswordSchema = z.object({ targetUserId: z.string().uuid() })

export async function resetMemberPassword(
  input: z.infer<typeof resetPasswordSchema>,
): Promise<ActionResult<{ targetUserId: string; tempPassword: string }>> {
  const guard = await requireAdmin()
  if ('error' in guard) return fail(guard.error)

  const parsed = resetPasswordSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')
  const { targetUserId } = parsed.data

  try {
    const [target] = await db
      .select({ username: users.username, authentikSub: users.authentikSub, status: users.status })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1)
    if (!target) return fail('errors.adminUserNotFound')
    if (target.status === 'deleted') return fail('errors.memberDeletedImmutable')
    // 아이디가 없으면 비밀번호로 로그인할 경로 자체가 없다 — 해시만 심으면
    // 아무도 못 쓰는 값이 계정에 남는다.
    if (!target.username || isGuestSub(target.authentikSub)) {
      return fail('errors.memberHasNoPasswordLogin')
    }

    const tempPassword = generateTempPassword()
    await db
      .update(users)
      .set({ passwordHash: await bcrypt.hash(tempPassword, 10) })
      .where(eq(users.id, targetUserId))

    return ok({ targetUserId, tempPassword })
  } catch (error) {
    console.error('resetMemberPassword failed:', error)
    return fail('errors.memberPasswordResetFailed')
  }
}

// ── 계정 상태 (정지 · 해제 · 삭제) ───────────────────────────────────────────

const setStatusSchema = z.object({
  targetUserIds: z.array(z.string().uuid()).min(1).max(BULK_LIMIT),
  status: z.enum(['active', 'suspended', 'deleted']),
  reason: z.union([reasonSchema, z.literal('')]),
})

/**
 * 대상이 하나여도 이 경로를 탄다. 단건과 일괄이 갈라지면 자기 자신 보호 같은 규칙이
 * 한쪽에만 남는다.
 *
 * `deleted`는 소프트 삭제다: 아이디·전화번호·비밀번호를 비워 로그인 수단과 고유 제약을
 * 풀되 행과 표시 이름은 남긴다. 지난 판 기록과 크레딧 원장이 이 행을 참조한다.
 */
export async function setMemberStatus(
  input: z.infer<typeof setStatusSchema>,
): Promise<ActionResult<MemberBulkResult>> {
  const guard = await requireAdmin()
  if ('error' in guard) return fail(guard.error)
  const { adminId } = guard

  const parsed = setStatusSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')
  const { status, reason } = parsed.data
  const targetUserIds = [...new Set(parsed.data.targetUserIds)]

  if (status !== 'active' && reason === '') return fail('errors.memberStatusReasonRequired')

  try {
    const rows = await db
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(inArray(users.id, targetUserIds))

    const found = new Map(rows.map((row) => [row.id, row]))
    const failed: MemberBulkFailure[] = []
    const eligible: string[] = []

    for (const id of targetUserIds) {
      const row = found.get(id)
      if (!row) failed.push({ userId: id, error: 'errors.adminUserNotFound' })
      else if (id === adminId) failed.push({ userId: id, error: 'errors.cannotChangeOwnStatus' })
      else if (row.status === 'deleted') failed.push({ userId: id, error: 'errors.memberDeletedImmutable' })
      else if (row.status === status) failed.push({ userId: id, error: 'errors.memberStatusUnchanged' })
      else eligible.push(id)
    }

    if (eligible.length > 0) {
      await db.transaction(async (tx) => {
        const stamp = {
          status,
          statusReason: reason === '' ? null : reason,
          statusChangedAt: new Date(),
          statusChangedBy: adminId,
        }

        // `users_admin_must_be_active_ck` 때문에 비활성으로 내릴 때 권한도 같이 내려야 한다.
        await tx
          .update(users)
          .set(status === 'active' ? stamp : { ...stamp, isAdmin: false })
          .where(inArray(users.id, eligible))

        if (status === 'deleted') {
          // sub는 NOT NULL + UNIQUE라 비울 수 없다. 같은 아이디로 재가입할 수 있게
          // 자리만 비켜 주되 값은 충돌하지 않는 형태로 남긴다.
          await tx
            .update(users)
            .set({
              username: null,
              phone: null,
              passwordHash: null,
              authentikSub: sql`'deleted:' || ${users.id}::text`,
            })
            .where(inArray(users.id, eligible))
        }
      })
    }

    return ok({ changed: eligible, failed })
  } catch (error) {
    console.error('setMemberStatus failed:', error)
    return fail('errors.memberStatusChangeFailed')
  }
}

// ── 관리자 권한 ──────────────────────────────────────────────────────────────

const setAdminBulkSchema = z.object({
  targetUserIds: z.array(z.string().uuid()).min(1).max(BULK_LIMIT),
  isAdmin: z.boolean(),
})

export async function setAdminBulk(
  input: z.infer<typeof setAdminBulkSchema>,
): Promise<ActionResult<MemberBulkResult>> {
  const guard = await requireAdmin()
  if ('error' in guard) return fail(guard.error)
  const { adminId } = guard

  const parsed = setAdminBulkSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')
  const { isAdmin } = parsed.data
  const targetUserIds = [...new Set(parsed.data.targetUserIds)]

  try {
    const rows = await db
      .select({
        id: users.id,
        authentikSub: users.authentikSub,
        isAdmin: users.isAdmin,
        status: users.status,
      })
      .from(users)
      .where(inArray(users.id, targetUserIds))

    const found = new Map(rows.map((row) => [row.id, row]))
    const failed: MemberBulkFailure[] = []
    const eligible: string[] = []

    for (const id of targetUserIds) {
      const row = found.get(id)
      if (!row) failed.push({ userId: id, error: 'errors.adminUserNotFound' })
      else if (id === adminId && !isAdmin)
        failed.push({ userId: id, error: 'errors.cannotRevokeOwnAdmin' })
      else if (isAdmin && isGuestSub(row.authentikSub))
        failed.push({ userId: id, error: 'errors.guestCannotBeAdmin' })
      else if (isAdmin && row.status !== 'active')
        failed.push({ userId: id, error: 'errors.inactiveCannotBeAdmin' })
      else if (row.isAdmin === isAdmin)
        failed.push({ userId: id, error: 'errors.memberRoleUnchanged' })
      else eligible.push(id)
    }

    if (eligible.length > 0) {
      await db.update(users).set({ isAdmin }).where(inArray(users.id, eligible))
    }

    return ok({ changed: eligible, failed })
  } catch (error) {
    console.error('setAdminBulk failed:', error)
    return fail('errors.setAdminFailed')
  }
}
