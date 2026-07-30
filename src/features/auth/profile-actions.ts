'use server'

import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { db, schema } from '@/lib/db'
import { consumeRateLimits } from '@/lib/rate-limit'
import { displayNameSchema } from './schemas'
import { currentUserId } from './session'

export type AccountAuthType = 'internal' | 'sso' | 'guest'

export interface AccountView {
  readonly displayName: string
  readonly username: string | null
  readonly phoneMasked: string | null
  readonly authType: AccountAuthType
  readonly isGuest: boolean
  readonly createdAt: string
}

function isGuestSub(authentikSub: string): boolean {
  return authentikSub.startsWith('guest:')
}

function accountAuthType(authentikSub: string, username: string | null): AccountAuthType {
  if (isGuestSub(authentikSub)) return 'guest'
  return username ? 'internal' : 'sso'
}

export async function getMyAccount(): Promise<ActionResult<AccountView>> {
  const userId = await currentUserId()
  if (!userId) return fail('errors.loginRequired')

  try {
    const [row] = await db
      .select({
        displayName: schema.users.displayName,
        username: schema.users.username,
        phone: schema.users.phone,
        authentikSub: schema.users.authentikSub,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1)
    if (!row) return fail('errors.loginRequired')

    return ok({
      displayName: row.displayName,
      username: row.username,
      phoneMasked: row.phone ? `****${row.phone.slice(-4)}` : null,
      authType: accountAuthType(row.authentikSub, row.username),
      isGuest: isGuestSub(row.authentikSub),
      createdAt: row.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('getMyAccount failed:', error)
    return fail('errors.accountLoadFailed')
  }
}

const updateDisplayNameSchema = z.object({
  displayName: displayNameSchema,
})

// 게스트 계정은 변경 시도를 세지 않아도 되지만, 반대로 여기서 먼저 세면
// 실제 DB 조회 전에 요청량을 제한할 수 있다. 로그인된 계정 하나가 짧은 시간에
// users 테이블을 반복 갱신하는 것을 막는 용도이므로 유량은 넉넉하게 둔다.
const RATE_LIMIT_SCOPE = 'account.update_display_name'
const RATE_LIMIT = { limit: 20, windowMs: 60 * 60 * 1000 } as const

export async function updateDisplayName(
  input: z.infer<typeof updateDisplayNameSchema>,
): Promise<ActionResult<{ displayName: string }>> {
  const userId = await currentUserId()
  if (!userId) return fail('errors.loginRequired')

  const parsed = updateDisplayNameSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')

  const rate = await consumeRateLimits([
    {
      scope: RATE_LIMIT_SCOPE,
      identifier: userId,
      limit: RATE_LIMIT.limit,
      windowMs: RATE_LIMIT.windowMs,
    },
  ])
  if (!rate.allowed) return fail('errors.updateDisplayNameRateLimited')

  try {
    const [row] = await db
      .select({ authentikSub: schema.users.authentikSub })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1)
    if (!row) return fail('errors.loginRequired')
    if (isGuestSub(row.authentikSub)) return fail('errors.guestCannotChangeName')

    await db
      .update(schema.users)
      .set({ displayName: parsed.data.displayName })
      .where(eq(schema.users.id, userId))

    return ok({ displayName: parsed.data.displayName })
  } catch (error) {
    console.error('updateDisplayName failed:', error)
    return fail('errors.updateDisplayNameFailed')
  }
}
