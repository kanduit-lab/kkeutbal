import 'server-only'

import { and, desc, eq, gt, isNull, lte, or } from 'drizzle-orm'
import { getOptionalDatabase } from '@/lib/optional-database'
import { PUBLIC_READ_TIMEOUT_MS, withTimeout } from '@/lib/with-timeout'
import type { AdminPromotionView, PromotionView } from './types'

export async function listActivePromotions(): Promise<PromotionView[]> {
  const now = new Date()
  try {
    const database = await getOptionalDatabase()
    if (!database) return []
    const { db, schema } = database
    const rows = db
      .select({
        id: schema.promotions.id,
        kind: schema.promotions.kind,
        title: schema.promotions.title,
        body: schema.promotions.body,
        linkUrl: schema.promotions.linkUrl,
        linkLabel: schema.promotions.linkLabel,
        dismissHours: schema.promotions.dismissHours,
      })
      .from(schema.promotions)
      .where(
        and(
          eq(schema.promotions.isActive, true),
          or(isNull(schema.promotions.startsAt), lte(schema.promotions.startsAt, now)),
          or(isNull(schema.promotions.endsAt), gt(schema.promotions.endsAt, now)),
        ),
      )
      .orderBy(desc(schema.promotions.priority), desc(schema.promotions.createdAt))
      .limit(20)
    return await withTimeout(rows, PUBLIC_READ_TIMEOUT_MS, 'listActivePromotions')
  } catch (error) {
    console.error('listActivePromotions failed:', error)
    return []
  }
}

export async function listPromotions(): Promise<AdminPromotionView[]> {
  const now = Date.now()
  const { db, schema } = await import('@/lib/db')
  const rows = await db
    .select({
      id: schema.promotions.id,
      kind: schema.promotions.kind,
      title: schema.promotions.title,
      body: schema.promotions.body,
      linkUrl: schema.promotions.linkUrl,
      linkLabel: schema.promotions.linkLabel,
      dismissHours: schema.promotions.dismissHours,
      isActive: schema.promotions.isActive,
      startsAt: schema.promotions.startsAt,
      endsAt: schema.promotions.endsAt,
      priority: schema.promotions.priority,
      createdByName: schema.users.displayName,
      createdAt: schema.promotions.createdAt,
    })
    .from(schema.promotions)
    .innerJoin(schema.users, eq(schema.users.id, schema.promotions.createdBy))
    .orderBy(desc(schema.promotions.priority), desc(schema.promotions.createdAt))
    .limit(100)

  return rows.map((row) => ({
    ...row,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    isLive:
      row.isActive &&
      (row.startsAt === null || row.startsAt.getTime() <= now) &&
      (row.endsAt === null || row.endsAt.getTime() > now),
  }))
}