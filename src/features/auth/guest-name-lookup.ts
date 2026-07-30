import { headers } from 'next/headers'
import { and, eq, isNull, like, or } from 'drizzle-orm'
import { z } from 'zod'
import { clientAddressFromHeaders, consumeRateLimits } from '@/lib/rate-limit'
import { serverEnv } from '@/lib/env'
import { guestTokenHash } from '@/features/auth/guest-tokens'

/** 게스트 토큰으로 이미 입장한 이름 목록을 조회 — `actions.ts`의 `getGuestNamesForToken` 구현. */

const guestNamesCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z2-9]{8}$/)

const GUEST_NAMES_INVALID = {
  ok: false as const,
  error: 'guest_token_invalid' as const,
  names: [] as readonly string[],
}

export async function lookupGuestNamesForToken(code: string) {
  const parsed = guestNamesCodeSchema.safeParse(code)
  if (!parsed.success) return GUEST_NAMES_INVALID

  try {
    const address = clientAddressFromHeaders(new Headers(await headers()))
    const rate = await consumeRateLimits([
      {
        scope: 'auth.guest_names.address',
        identifier: address,
        limit: 30,
        windowMs: 15 * 60 * 1000,
      },
      {
        scope: 'auth.guest_names.token_address',
        identifier: `${parsed.data}\0${address}`,
        limit: 10,
        windowMs: 15 * 60 * 1000,
      },
    ])
    if (!rate.allowed) return GUEST_NAMES_INVALID

    const codeHash = guestTokenHash(parsed.data, serverEnv().AUTH_SECRET)
    const { db, schema } = await import('@/lib/db')
    const [token] = await db
      .select({
        id: schema.guestTokens.id,
        code: schema.guestTokens.code,
        expiresAt: schema.guestTokens.expiresAt,
      })
      .from(schema.guestTokens)
      .where(
        and(
          or(eq(schema.guestTokens.codeHash, codeHash), eq(schema.guestTokens.code, parsed.data)),
          isNull(schema.guestTokens.revokedAt),
        ),
      )
      .limit(1)
    if (!token) return GUEST_NAMES_INVALID
    if (token.expiresAt && token.expiresAt.getTime() < Date.now()) return GUEST_NAMES_INVALID
    if (token.code) {
      await db
        .update(schema.guestTokens)
        .set({ code: null, codeHash })
        .where(eq(schema.guestTokens.id, token.id))
    }

    const rows = await db
      .select({ name: schema.users.displayName })
      .from(schema.users)
      .where(like(schema.users.authentikSub, `guest:${token.id}:%`))
      .orderBy(schema.users.displayName)
      .limit(20)
    return { ok: true as const, names: rows.map((row) => row.name) }
  } catch (error) {
    console.error('getGuestNamesForToken failed:', error)

    return GUEST_NAMES_INVALID
  }
}
