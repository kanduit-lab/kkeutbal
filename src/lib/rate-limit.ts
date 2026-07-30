import 'server-only'

import { createHmac } from 'node:crypto'
import { lt, sql } from 'drizzle-orm'
import { serverEnv } from './env'

export interface RateLimitRule {
  readonly scope: string
  readonly identifier: string
  readonly limit: number
  readonly windowMs: number
}

export interface RateLimitResult {
  readonly allowed: boolean
  readonly retryAfterSeconds: number
}

function hashIdentifier(scope: string, identifier: string): string {
  return createHmac('sha256', serverEnv().AUTH_SECRET)
    .update(scope)
    .update('\0')
    .update(identifier.trim().toLowerCase())
    .digest('hex')
}

/**
 * 인증 이후 액션용 — 한도에 걸렸을 때만 관리자인지 보고, 관리자면 통과시킨다.
 *
 * **로그인 경로에는 쓸 수 없다.** 로그인은 비밀번호 검증 전이라 상대가 누구인지 모르고,
 * 아이디로 먼저 조회해 관리자를 면제하면 관리자 계정이 무제한 비밀번호 시도의 표적이 된다 —
 * 가장 보호가 필요한 계정이 가장 약해진다. 그래서 이 함수는 `userId`(세션에서 확인된 주체)를
 * 요구한다.
 *
 * 관리자 조회는 한도에 걸린 뒤에만 한다 — 일반 사용자의 정상 경로에 쿼리를 추가하지 않는다.
 */
export async function consumeRateLimitsUnlessAdmin(
  userId: string,
  rules: readonly RateLimitRule[],
  now = Date.now(),
): Promise<RateLimitResult> {
  const result = await consumeRateLimits(rules, now)
  if (result.allowed) return result

  const { isAdminUser } = await import('@/features/auth/roles')
  if (await isAdminUser(userId)) {
    console.warn('rate limit bypassed for admin:', { userId, scopes: rules.map((r) => r.scope) })
    return { allowed: true, retryAfterSeconds: 0 }
  }
  return result
}

export async function consumeRateLimits(
  rules: readonly RateLimitRule[],
  now = Date.now(),
): Promise<RateLimitResult> {
  if (rules.length === 0) return { allowed: true, retryAfterSeconds: 0 }

  const { db, schema } = await import('./db')
  return await db.transaction(async (tx) => {
    const nowDate = new Date(now)
    await tx.delete(schema.rateLimitBuckets).where(lt(schema.rateLimitBuckets.expiresAt, nowDate))

    let allowed = true
    let retryAfterSeconds = 0

    for (const rule of rules) {
      if (rule.limit < 1 || rule.windowMs < 1) {
        throw new Error(`Invalid rate limit configuration for ${rule.scope}`)
      }

      const windowStartMs = Math.floor(now / rule.windowMs) * rule.windowMs
      const windowStart = new Date(windowStartMs)
      const expiresAt = new Date(windowStartMs + rule.windowMs)

      const windowStartIso = windowStart.toISOString()
      const keyHash = hashIdentifier(rule.scope, rule.identifier)

      const [bucket] = await tx
        .insert(schema.rateLimitBuckets)
        .values({
          scope: rule.scope,
          keyHash,
          windowStart,
          hits: 1,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: [schema.rateLimitBuckets.scope, schema.rateLimitBuckets.keyHash],
          set: {
            windowStart,
            expiresAt,
            hits: sql<number>`case
              when ${schema.rateLimitBuckets.windowStart} < ${windowStartIso}
                then 1
              else ${schema.rateLimitBuckets.hits} + 1
            end`,
          },
        })
        .returning({
          hits: schema.rateLimitBuckets.hits,
          expiresAt: schema.rateLimitBuckets.expiresAt,
        })

      if (bucket && bucket.hits > rule.limit) {
        allowed = false
        retryAfterSeconds = Math.max(
          retryAfterSeconds,
          Math.ceil((bucket.expiresAt.getTime() - now) / 1000),
        )
      }
    }

    return { allowed, retryAfterSeconds }
  })
}

export function clientAddressFromHeaders(headers: Headers): string {
  const direct = headers.get('cf-connecting-ip')?.trim() || headers.get('x-real-ip')?.trim() || null
  if (direct) return direct.slice(0, 128)

  const forwarded = headers.get('x-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()
  return (first || 'unknown').slice(0, 128)
}