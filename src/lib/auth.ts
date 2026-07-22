import NextAuth from 'next-auth'
import type { NextAuthConfig } from 'next-auth'
import Authentik from 'next-auth/providers/authentik'
import Credentials from 'next-auth/providers/credentials'
import { z } from 'zod'
import { authConfigBase } from './auth-config'
import { db, schema } from './db'
import { serverEnv } from './env'

/**
 * Auth.js v5 — Authentik OIDC (운영) + 개발용 게스트 로그인.
 *
 * Authentik 자격 증명은 `AUTH_AUTHENTIK_ID` / `_SECRET` / `_ISSUER` 에서 자동으로 읽으며,
 * 세 값이 모두 있을 때만 provider 가 노출된다.
 *
 * 게스트 로그인은 `AUTH_DEV_LOGIN=true` 일 때만 켜진다. 이름만으로 로그인되므로
 * 프로덕션에서는 반드시 꺼야 한다 (같은 이름 = 같은 계정).
 */

const env = serverEnv()

const guestSchema = z.object({ name: z.string().trim().min(1).max(20) })

function buildProviders(): NextAuthConfig['providers'] {
  const providers: NextAuthConfig['providers'] = []

  if (env.AUTH_AUTHENTIK_ID && env.AUTH_AUTHENTIK_SECRET && env.AUTH_AUTHENTIK_ISSUER) {
    providers.push(Authentik)
  }

  if (env.AUTH_DEV_LOGIN) {
    providers.push(
      Credentials({
        id: 'dev-login',
        name: '게스트',
        credentials: { name: { label: '이름' } },
        authorize(credentials) {
          const parsed = guestSchema.safeParse(credentials)
          if (!parsed.success) return null
          const name = parsed.data.name
          // 같은 이름이면 같은 사용자로 매핑한다 — MT 도중 기기를 바꿔도 전적이 이어진다.
          return { id: `dev:${name.toLowerCase()}`, name }
        },
      }),
    )
  }

  return providers
}

export function hasAuthentik(): boolean {
  return Boolean(env.AUTH_AUTHENTIK_ID && env.AUTH_AUTHENTIK_SECRET && env.AUTH_AUTHENTIK_ISSUER)
}

export function hasDevLogin(): boolean {
  return env.AUTH_DEV_LOGIN
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfigBase,
  providers: buildProviders(),
  callbacks: {
    ...authConfigBase.callbacks,
    async jwt({ token, user, account }) {
      // 최초 로그인 시에만 실행된다. IdP 신원을 public.users 로 미러링하고 내부 id 를 붙인다.
      if (user && account) {
        const sub =
          account.provider === 'dev-login'
            ? String(user.id)
            : (token.sub ?? `${account.provider}:${String(user.id)}`)
        const displayName = user.name?.trim() || '플레이어'
        const avatarUrl = user.image ?? null

        try {
          const [row] = await db
            .insert(schema.users)
            .values({ authentikSub: sub, displayName, avatarUrl })
            .onConflictDoUpdate({
              target: schema.users.authentikSub,
              set: { displayName, avatarUrl },
            })
            .returning({ id: schema.users.id })

          if (row) token.uid = row.id
          token.name = displayName
        } catch (error) {
          console.error('user upsert failed on sign-in:', error)
          throw new Error('로그인 처리 중 오류가 발생했습니다')
        }
      }
      return token
    },
  },
})
