import NextAuth from 'next-auth'
import type { NextAuthConfig } from 'next-auth'
import Authentik from 'next-auth/providers/authentik'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { and, eq, isNull, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { authConfigBase } from './auth-config'
import { serverEnv } from './env'
import { clientAddressFromHeaders, consumeRateLimits } from './rate-limit'
import { getActiveSsoSettings, type ActiveSsoSettings } from '@/features/auth/sso-settings'
import { createUserGrantingFirstAdmin } from '@/features/auth/bootstrap'
import { guestTokenHash } from '@/features/auth/guest-tokens'

/**
 * Auth.js v5 — 3개 로그인 경로.
 *
 * - `password`: 내부 계정 (아이디·비밀번호). 회원가입은 features/auth/actions.ts.
 * - `authentik`: OIDC SSO. 관리자 화면에서 활성화·저장한 설정이 완전할 때만 노출되며,
 *   아이디 또는 전화번호가 일치하는 내부 계정이 있으면 같은 계정으로 자동 연동한다.
 * - `guest-token`: 관리자가 발급한 토큰 + 이름. 같은 (토큰, 이름) = 같은 계정.
 */

const passwordSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,20}$/),
  password: z.string().min(8).max(72),
})

const guestTokenSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z2-9]{8}$/),
  name: z.string().trim().min(1).max(20),
})

function buildProviders(sso: ActiveSsoSettings | null): NextAuthConfig['providers'] {
  const providers: NextAuthConfig['providers'] = []

  if (sso) {
    providers.push(
      Authentik({
        clientId: sso.clientId,
        clientSecret: sso.clientSecret,
        issuer: sso.issuer,
      }),
    )
  }

  providers.push(
    Credentials({
      id: 'password',
      name: '아이디 로그인',
      credentials: {
        username: { label: '아이디' },
        password: { label: '비밀번호', type: 'password' },
      },
      async authorize(credentials, request) {
        const parsed = passwordSchema.safeParse(credentials)
        if (!parsed.success) return null
        const address = clientAddressFromHeaders(request.headers)
        const rate = await consumeRateLimits([
          {
            scope: 'auth.password.address',
            identifier: address,
            limit: 30,
            windowMs: 15 * 60 * 1000,
          },
          {
            scope: 'auth.password.account_address',
            identifier: `${parsed.data.username}\0${address}`,
            limit: 10,
            windowMs: 15 * 60 * 1000,
          },
          {
            scope: 'auth.password.account',
            identifier: parsed.data.username,
            limit: 100,
            windowMs: 60 * 60 * 1000,
          },
        ])
        if (!rate.allowed) return null

        const { db, schema } = await import('./db')
        const [row] = await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.username, parsed.data.username))
          .limit(1)
        if (!row?.passwordHash) return null
        const match = await bcrypt.compare(parsed.data.password, row.passwordHash)
        if (!match) return null
        return { id: row.id, name: row.displayName, image: row.avatarUrl }
      },
    }),
  )

  providers.push(
    Credentials({
      id: 'guest-token',
      name: '게스트 토큰',
      credentials: { code: { label: '토큰' }, name: { label: '이름' } },
      async authorize(credentials, request) {
        const parsed = guestTokenSchema.safeParse(credentials)
        if (!parsed.success) return null
        const { code, name } = parsed.data
        const address = clientAddressFromHeaders(request.headers)
        const rate = await consumeRateLimits([
          {
            scope: 'auth.guest.address',
            identifier: address,
            limit: 40,
            windowMs: 15 * 60 * 1000,
          },
          {
            scope: 'auth.guest.token_address',
            identifier: `${code}\0${address}`,
            limit: 20,
            windowMs: 15 * 60 * 1000,
          },
          {
            scope: 'auth.guest.token',
            identifier: code,
            limit: 200,
            windowMs: 15 * 60 * 1000,
          },
        ])
        if (!rate.allowed) return null

        const { db, schema } = await import('./db')
        const codeHash = guestTokenHash(code, serverEnv().AUTH_SECRET)
        // 회수와 신규 로그인을 같은 토큰 행 잠금으로 직렬화한다. 조회 뒤 회수가 커밋되면
        // 새 세션을 발급하는 경쟁 조건이 생기므로 레거시 원문 해시 전환도 이 트랜잭션에 둔다.
        const token = await db.transaction(async (tx) => {
          const [active] = await tx
            .select({
              id: schema.guestTokens.id,
              code: schema.guestTokens.code,
              expiresAt: schema.guestTokens.expiresAt,
            })
            .from(schema.guestTokens)
            .where(
              and(
                or(eq(schema.guestTokens.codeHash, codeHash), eq(schema.guestTokens.code, code)),
                isNull(schema.guestTokens.revokedAt),
              ),
            )
            .limit(1)
            .for('update')
          if (!active) return null
          if (active.expiresAt && active.expiresAt.getTime() < Date.now()) return null
          if (active.code) {
            await tx
              .update(schema.guestTokens)
              .set({ code: null, codeHash })
              .where(eq(schema.guestTokens.id, active.id))
          }
          return active
        })
        if (!token) return null
        // 같은 (토큰, 이름)이면 같은 게스트 계정 — 기기를 바꿔도 전적이 이어진다.
        return { id: `guest:${token.id}:${name.toLowerCase()}`, name }
      },
    }),
  )

  return providers
}

export async function hasAuthentik(): Promise<boolean> {
  return Boolean(await getActiveSsoSettings())
}

/** OIDC profile 의 병합 단서 — 표준 클레임에서 아이디·전화번호를 뽑는다. */
function mergeHints(profile: unknown): { username: string | null; phone: string | null } {
  if (!profile || typeof profile !== 'object') return { username: null, phone: null }
  const p = profile as { preferred_username?: unknown; phone_number?: unknown }
  const username =
    typeof p.preferred_username === 'string' ? p.preferred_username.trim().toLowerCase() : null
  const phoneDigits = typeof p.phone_number === 'string' ? p.phone_number.replace(/\D/g, '') : null
  return {
    username: username && /^[a-z0-9_]{3,20}$/.test(username) ? username : null,
    phone: phoneDigits && phoneDigits.length >= 9 ? phoneDigits : null,
  }
}

/**
 * provider 신원(sub)을 public.users 로 해석한다.
 * 1) sub 일치 행이 있으면 그 계정.
 * 2) (OIDC) 아이디·전화번호가 일치하는 내부 계정이 있으면 sub 를 교체해 병합.
 * 3) 없으면 새 행 생성.
 */
async function resolveProviderUser(input: {
  sub: string
  displayName: string
  avatarUrl: string | null
  hints: { username: string | null; phone: string | null }
}): Promise<{ id: string }> {
  const { sub, displayName, avatarUrl, hints } = input
  const { db, schema } = await import('./db')

  const [bySub] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.authentikSub, sub))
    .limit(1)
  if (bySub) {
    await db
      .update(schema.users)
      .set({ displayName, avatarUrl })
      .where(eq(schema.users.id, bySub.id))
    return bySub
  }

  if (hints.username || hints.phone) {
    const conditions = [
      hints.username ? eq(schema.users.username, hints.username) : sql`false`,
      hints.phone ? eq(schema.users.phone, hints.phone) : sql`false`,
    ]
    const matches = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(or(...conditions))
      .limit(2)

    // 아이디와 전화번호가 서로 다른 두 계정을 가리키면 어느 쪽도 자동 병합하지 않는다.
    // OR UPDATE 로 둘 다 갱신하면 계정을 잘못 합치거나 authentik_sub UNIQUE 충돌이 난다.
    const [onlyMatch] = matches
    if (matches.length === 1 && onlyMatch) {
      const [linked] = await db
        .update(schema.users)
        .set({ authentikSub: sub, displayName, avatarUrl })
        .where(eq(schema.users.id, onlyMatch.id))
        .returning({ id: schema.users.id })
      if (linked) return linked
    }
  }

  // 첫 계정이면 관리자로 승격한다. SSO 가 유일한 로그인 수단인 인스턴스에서도 관리자를
  // 세울 수 있어야 하므로, 비밀번호 가입과 똑같은 함수를 쓴다.
  try {
    return await createUserGrantingFirstAdmin({ authentikSub: sub, displayName, avatarUrl })
  } catch (error) {
    // 같은 provider 신원의 최초 로그인 두 건이 겹치면, 한 요청이 먼저 사용자 행을 만들고
    // 다른 요청은 authentik_sub UNIQUE 충돌을 받는다. 충돌한 쪽도 이미 확정된 정본 행을
    // 사용해야 재시도 가능한 로그인 오류로 바뀌지 않는다.
    const isUniqueViolation =
      typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
    if (!isUniqueViolation) throw error

    const [createdByConcurrentRequest] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.authentikSub, sub))
      .limit(1)
    if (createdByConcurrentRequest) return createdByConcurrentRequest
    throw error
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  const sso = await getActiveSsoSettings()
  return {
    ...authConfigBase,
    providers: buildProviders(sso),
    callbacks: {
      ...authConfigBase.callbacks,
      async jwt({ token, user, account, profile }) {
        // 최초 로그인 시에만 실행된다.
        if (user && account) {
          try {
            if (account.provider === 'password') {
              // authorize 가 내부 사용자 행을 검증했다 — id 가 곧 내부 id.
              token.uid = String(user.id)
              token.name = user.name
              return token
            }

            const isCredentialGuest = account.provider === 'guest-token'
            const sub = isCredentialGuest
              ? String(user.id)
              : (token.sub ?? `${account.provider}:${String(user.id)}`)
            const displayName = user.name?.trim() || '플레이어'

            const row = await resolveProviderUser({
              sub,
              displayName,
              avatarUrl: user.image ?? null,
              hints:
                account.provider === 'authentik'
                  ? mergeHints(profile)
                  : { username: null, phone: null },
            })
            token.uid = row.id
            token.name = displayName
          } catch (error) {
            console.error('sign-in user resolution failed:', error)
            throw new Error('로그인 처리 중 오류가 발생했습니다')
          }
        }
        return token
      },
    },
  }
})
