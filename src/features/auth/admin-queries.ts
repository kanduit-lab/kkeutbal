import { desc, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

/** 관리자 페이지 전용 조회. 호출 전 isAdminUser 게이트를 통과해야 한다. */

export interface GuestTokenView {
  readonly id: string
  readonly code: string
  readonly label: string
  readonly createdByName: string
  readonly createdAt: string
  readonly expiresAt: string | null
  readonly revokedAt: string | null
}

export async function listGuestTokens(): Promise<GuestTokenView[]> {
  const rows = await db
    .select({
      id: schema.guestTokens.id,
      code: schema.guestTokens.code,
      label: schema.guestTokens.label,
      createdByName: schema.users.displayName,
      createdAt: schema.guestTokens.createdAt,
      expiresAt: schema.guestTokens.expiresAt,
      revokedAt: schema.guestTokens.revokedAt,
    })
    .from(schema.guestTokens)
    .innerJoin(schema.users, eq(schema.users.id, schema.guestTokens.createdBy))
    .orderBy(desc(schema.guestTokens.createdAt))
    .limit(100)

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  }))
}

export interface AdminUserView {
  readonly id: string
  readonly displayName: string
  readonly username: string | null
  /** 뒷자리 4자리만 노출한다. */
  readonly phoneMasked: string | null
  readonly isAdmin: boolean
  readonly isGuest: boolean
  readonly createdAt: string
}

export async function listUsers(): Promise<AdminUserView[]> {
  const rows = await db
    .select({
      id: schema.users.id,
      displayName: schema.users.displayName,
      username: schema.users.username,
      phone: schema.users.phone,
      isAdmin: schema.users.isAdmin,
      authentikSub: schema.users.authentikSub,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .orderBy(desc(schema.users.createdAt))
    .limit(200)

  return rows.map((row) => ({
    id: row.id,
    displayName: row.displayName,
    username: row.username,
    phoneMasked: row.phone ? `****${row.phone.slice(-4)}` : null,
    isAdmin: row.isAdmin,
    isGuest: row.authentikSub.startsWith('guest:') || row.authentikSub.startsWith('dev:'),
    createdAt: row.createdAt.toISOString(),
  }))
}
