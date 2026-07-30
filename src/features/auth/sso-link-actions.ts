'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { db, schema } from '@/lib/db'
import { clientAddressFromHeaders, consumeRateLimits } from '@/lib/rate-limit'
import { hasAuthentik, signIn } from '@/lib/auth'
import { beginSsoLinkIntent } from './sso-link-cookies'
import { currentUserId } from './session'
import { isAccountUnlinked, localSubFor } from './account-linkage'

function isGuestSub(authentikSub: string): boolean {
  return authentikSub.startsWith('guest:')
}

const LINK_USER_RATE_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 } as const
const LINK_ADDRESS_RATE_LIMIT = { limit: 30, windowMs: 60 * 60 * 1000 } as const
const DISCONNECT_RATE_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 } as const

/**
 * `/account`의 "SSO 계정 연결" 버튼이 form action으로 바로 이 함수를 호출한다.
 *
 * 여기서 하는 확인은 전부 **빠른 사용자 피드백을 위한 선제 확인**이다 — 아직 Authentik으로
 * 넘어가기 전이라 세션이나 도메인을 벗어나지 않으므로, 실패해도 그냥 `/account`로 쿼리스트링과
 * 함께 돌아간다(미들웨어의 "로그인 상태로 /login 접근 시 / 로 리다이렉트" 규칙과 무관하다).
 *
 * **최종 판정은 여기서 하지 않는다.** "이 sub가 이미 다른 계정에 연결돼 있는지",
 * "대상 계정에 이미 다른 sub가 연결돼 있는지"는 실제 OAuth 콜백이 도착한 뒤
 * `src/lib/auth.ts`의 jwt 콜백이 같은 트랜잭션 맥락에서 다시 확인한다 — 여기서만 확인하면
 * signIn() 호출과 콜백 도착 사이의 시간차 동안 경쟁이 생길 수 있다.
 */
export async function beginSsoLink(): Promise<void> {
  const userId = await currentUserId()
  if (!userId) redirect('/login?next=/account')

  const address = clientAddressFromHeaders(new Headers(await headers()))
  const rate = await consumeRateLimits([
    {
      scope: 'account.sso_link.user',
      identifier: userId,
      limit: LINK_USER_RATE_LIMIT.limit,
      windowMs: LINK_USER_RATE_LIMIT.windowMs,
    },
    {
      scope: 'account.sso_link.address',
      identifier: address,
      limit: LINK_ADDRESS_RATE_LIMIT.limit,
      windowMs: LINK_ADDRESS_RATE_LIMIT.windowMs,
    },
  ])
  if (!rate.allowed) redirect('/account?ssoError=rate_limited')

  if (!(await hasAuthentik())) redirect('/account?ssoError=not_configured')

  const [row] = await db
    .select({ authentikSub: schema.users.authentikSub, username: schema.users.username })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1)
  if (!row) redirect('/login?next=/account')
  if (isGuestSub(row.authentikSub)) redirect('/account?ssoError=guest')
  if (!row.username) redirect('/account?ssoError=native')
  if (!isAccountUnlinked(row)) redirect('/account?ssoError=already_linked')

  await beginSsoLinkIntent(userId)
  await signIn('authentik', { redirectTo: '/account' })
}

export async function disconnectSso(): Promise<ActionResult<{ linked: boolean }>> {
  const userId = await currentUserId()
  if (!userId) return fail('errors.loginRequired')

  const rate = await consumeRateLimits([
    {
      scope: 'account.sso_disconnect',
      identifier: userId,
      limit: DISCONNECT_RATE_LIMIT.limit,
      windowMs: DISCONNECT_RATE_LIMIT.windowMs,
    },
  ])
  if (!rate.allowed) return fail('errors.ssoDisconnectRateLimited')

  try {
    const [row] = await db
      .select({
        authentikSub: schema.users.authentikSub,
        username: schema.users.username,
        passwordHash: schema.users.passwordHash,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1)
    if (!row) return fail('errors.loginRequired')
    if (isGuestSub(row.authentikSub)) return fail('errors.ssoGuestCannotLink')
    // username이 없으면 SSO 전용 계정 — 로그인 수단이 이것뿐이라 해제를 제공하지 않는다.
    if (!row.username) return fail('errors.ssoDisconnectUnsafe')
    if (isAccountUnlinked(row)) return fail('errors.ssoNotLinked')
    // 비밀번호가 없으면 해제 즉시 이 계정으로 다시 로그인할 방법이 사라진다 — 잠금 위험.
    if (!row.passwordHash) return fail('errors.ssoDisconnectUnsafe')

    const [updated] = await db
      .update(schema.users)
      .set({ authentikSub: localSubFor(row.username) })
      .where(and(eq(schema.users.id, userId), eq(schema.users.authentikSub, row.authentikSub)))
      .returning({ id: schema.users.id })
    if (!updated) return fail('errors.ssoDisconnectFailed')

    console.warn('sso account unlinked by user request:', { userId })
    return ok({ linked: false })
  } catch (error) {
    console.error('disconnectSso failed:', error)
    return fail('errors.ssoDisconnectFailed')
  }
}
