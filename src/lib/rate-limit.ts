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