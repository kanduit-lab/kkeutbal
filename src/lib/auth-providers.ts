import type { NextAuthConfig } from 'next-auth'
import { CredentialsSignin } from 'next-auth'
import Authentik from 'next-auth/providers/authentik'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { and, eq, isNull, or } from 'drizzle-orm'
import { z } from 'zod'
import { serverEnv } from './env'
import { clientAddressFromHeaders, consumeRateLimits } from './rate-limit'
import type { ActiveSsoSettings } from '@/features/auth/sso-settings'
import { guestTokenHash } from '@/features/auth/guest-tokens'
import { GUEST_DEVICE_SECRET_PATTERN, guestIdentitySub } from '@/features/auth/guest-identity'

/**
 * NextAuth provider 구성 — Authentik(OIDC) + Credentials(비밀번호, 게스트 토큰) 인증 로직과
 * 각 provider 고유의 rate limit을 한곳에 둔다. 로그인 성공 뒤 계정을 어떻게 해석·연결할지는
 * 이 파일의 책임이 아니다 — `src/lib/auth.ts`의 jwt 콜백과
 * `@/features/auth/provider-account-resolution`을 본다.
 *
 * 게스트 sub 계산 규칙과 그 근거는 `@/features/auth/guest-identity`에 있다. 이 파일은 토큰이
 * 살아 있는지만 확인하고 sub 생성은 거기에 맡긴다.
 */

export const RATE_LIMITED_CODE = 'rate_limited'

class RateLimitedSignIn extends CredentialsSignin {
  override code = RATE_LIMITED_CODE
}

const ADDRESS_LIMITS = {
  password: 120,
  guest: 200,
} as const

const passwordSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,20}$/),
  password: z.string().min(8).max(72),
})

/**
 * `device`는 게스트 로그인 Server Action이 발급·연장한 이 기기의 비밀값이다
 * (`features/auth/guest-device.ts`). 폼에서 오는 값이 아니라 서버가 쿠키에서 확정해 넘긴다.
 * 없거나 형식이 다르면 로그인을 거부한다 — 기기 결속 없이 만든 게스트 계정은 아무도 다시
 * 들어올 수 없고, 무엇보다 이름만으로 남의 계정에 붙는 예전 동작으로 조용히 되돌아간다.
 */
const guestTokenSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z2-9]{8}$/),
  name: z.string().trim().min(1).max(20),
  device: z.string().regex(GUEST_DEVICE_SECRET_PATTERN),
})

export function buildProviders(sso: ActiveSsoSettings | null): NextAuthConfig['providers'] {
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
            limit: ADDRESS_LIMITS.password,
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
        if (!rate.allowed) throw new RateLimitedSignIn()

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
        const { code, name, device } = parsed.data
        const address = clientAddressFromHeaders(request.headers)
        const rate = await consumeRateLimits([
          {
            scope: 'auth.guest.address',
            identifier: address,
            limit: ADDRESS_LIMITS.guest,
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
        if (!rate.allowed) throw new RateLimitedSignIn()

        const { db, schema } = await import('./db')
        const codeHash = guestTokenHash(code, serverEnv().AUTH_SECRET)

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

        return {
          id: guestIdentitySub({
            tokenId: token.id,
            deviceSecret: device,
            name,
            secret: serverEnv().AUTH_SECRET,
          }),
          name,
        }
      },
    }),
  )

  return providers
}
