import 'server-only'

import { and, desc, eq, gt, isNull, lte, or } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type { AdminPromotionView, PromotionView } from './types'

/**
 * 노출 조건을 만족하는 프로모션. 루트 레이아웃에서 부르므로 절대 던지지 않는다 —
 * 광고 슬롯 조회 실패가 페이지 전체를 죽이면 안 된다.
 */
export async function listActivePromotions(): Promise<PromotionView[]> {
  const now = new Date()
  try {
    return await db
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
  } catch (error) {
    console.error('listActivePromotions failed:', error)
    return []
  }
}

/** 관리자 목록 — 비활성·예약·종료분까지 전부. 호출 전 isAdminUser 게이트를 통과해야 한다. */
export async function listPromotions(): Promise<AdminPromotionView[]> {
  const now = Date.now()
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
