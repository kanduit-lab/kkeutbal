import NextAuth from 'next-auth'
import type { NextAuthConfig } from 'next-auth'
import Authentik from 'next-auth/providers/authentik'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { and, eq, isNull, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { authConfigBase } from './auth-config'
import { db, schema } from './db'
import { serverEnv } from './env'

/**
 * Auth.js v5 — 3개 로그인 경로.
 *
 * - `password`: 내부 계정 (아이디·비밀번호). 회원가입은 features/auth/actions.ts.
 * - `authentik`: OIDC SSO. `AUTH_AUTHENTIK_*` 3종이 모두 있을 때만 노출되며,
 *   아이디 또는 전화번호가 일치하는 내부 계정이 있으면 같은 계정으로 자동 연동한다.
 * - `guest-token`: 관리자가 발급한 토큰 + 이름. 같은 (토큰, 이름) = 같은 계정.
 */

const env = serverEnv()

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

function buildProviders(): NextAuthConfig['providers'] {
  const providers: NextAuthConfig['providers'] = []

  if (env.AUTH_AUTHENTIK_ID && env.AUTH_AUTHENTIK_SECRET && env.AUTH_AUTHENTIK_ISSUER) {
    providers.push(Authentik)
  }

  providers.push(
    Credentials({
      id: 'password',
      name: '아이디 로그인',
      credentials: {
        username: { label: '아이디' },
        password: { label: '비밀번호', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = passwordSchema.safeParse(credentials)
        if (!parsed.success) return null
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
      async authorize(credentials) {
        const parsed = guestTokenSchema.safeParse(credentials)
        if (!parsed.success) return null
        const { code, name } = parsed.data
        const [token] = await db
          .select({ id: schema.guestTokens.id, expiresAt: schema.guestTokens.expiresAt })
          .from(schema.guestTokens)
          .where(and(eq(schema.guestTokens.code, code), isNull(schema.guestTokens.revokedAt)))
          .limit(1)
        if (!token) return null
        if (token.expiresAt && token.expiresAt.getTime() < Date.now()) return null
        // 같은 (토큰, 이름)이면 같은 게스트 계정 — 기기를 바꿔도 전적이 이어진다.
        return { id: `guest:${token.id}:${name.toLowerCase()}`, name }
      },
    }),
  )

  return providers
}

export function hasAuthentik(): boolean {
  return Boolean(env.AUTH_AUTHENTIK_ID && env.AUTH_AUTHENTIK_SECRET && env.AUTH_AUTHENTIK_ISSUER)
}

/** OIDC profile 의 병합 단서 — 표준 클레임에서 아이디·전화번호를 뽑는다. */
function mergeHints(profile: unknown): { username: string | null; phone: string | null } {
  if (!profile || typeof profile !== 'object') return { username: null, phone: null }
  const p = profile as { preferred_username?: unknown; phone_number?: unknown }
  const username =
    typeof p.preferred_username === 'string' ? p.preferred_username.trim().toLowerCase() : null
  const phoneDigits =
    typeof p.phone_number === 'string' ? p.phone_number.replace(/\D/g, '') : null
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
    const [linked] = await db
      .update(schema.users)
      .set({ authentikSub: sub, displayName, avatarUrl })
      .where(or(...conditions))
      .returning({ id: schema.users.id })
    if (linked) return linked
  }

  const [created] = await db
    .insert(schema.users)
    .values({ authentikSub: sub, displayName, avatarUrl })
    .returning({ id: schema.users.id })
  if (!created) throw new Error('user insert failed')
  return created
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfigBase,
  providers: buildProviders(),
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
})
