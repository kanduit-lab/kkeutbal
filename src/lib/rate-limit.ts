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
 * 여러 제한을 한 트랜잭션에서 소비한다.
 * 각 버킷은 PK 충돌 갱신으로 원자 증가하므로 다중 프로세스에서도 허용량을 초과 통과시키지 않는다.
 */
export async function consumeRateLimits(
  rules: readonly RateLimitRule[],
  now = Date.now(),
): Promise<RateLimitResult> {
  if (rules.length === 0) return { allowed: true, retryAfterSeconds: 0 }

  const { db, schema } = await import('./db')
  return await db.transaction(async (tx) => {
    const nowDate = new Date(now)
    await tx
      .delete(schema.rateLimitBuckets)
      .where(lt(schema.rateLimitBuckets.expiresAt, nowDate))

    let allowed = true
    let retryAfterSeconds = 0

    for (const rule of rules) {
      if (rule.limit < 1 || rule.windowMs < 1) {
        throw new Error(`Invalid rate limit configuration for ${rule.scope}`)
      }

      const windowStartMs = Math.floor(now / rule.windowMs) * rule.windowMs
      const windowStart = new Date(windowStartMs)
      const expiresAt = new Date(windowStartMs + rule.windowMs)
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
              when ${schema.rateLimitBuckets.windowStart} < ${windowStart}
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

/**
 * 배포 프록시가 전달한 클라이언트 주소를 제한 키로 정규화한다.
 * 계정/토큰 단위 제한을 항상 함께 사용하므로 주소 헤더가 없는 환경도 우회 경로가 되지 않는다.
 */
export function clientAddressFromHeaders(headers: Headers): string {
  const direct =
    headers.get('cf-connecting-ip')?.trim() || headers.get('x-real-ip')?.trim() || null
  if (direct) return direct.slice(0, 128)

  const forwarded = headers.get('x-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()
  return (first || 'unknown').slice(0, 128)
}
