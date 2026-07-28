import { desc, eq, inArray, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type { RoomGameType } from '@/features/game/types'

export interface GuestTokenView {
  readonly id: string
  readonly label: string
  readonly createdByName: string
  readonly createdAt: string
  readonly expiresAt: string | null
  readonly revokedAt: string | null
}

export interface RegistrationCodeView {
  readonly id: string
  readonly label: string
  readonly createdByName: string
  readonly createdAt: string
  readonly expiresAt: string | null
  readonly revokedAt: string | null
}

export async function listRegistrationCodes(): Promise<RegistrationCodeView[]> {
  const rows = await db
    .select({
      id: schema.registrationCodes.id,
      label: schema.registrationCodes.label,
      createdByName: schema.users.displayName,
      createdAt: schema.registrationCodes.createdAt,
      expiresAt: schema.registrationCodes.expiresAt,
      revokedAt: schema.registrationCodes.revokedAt,
    })
    .from(schema.registrationCodes)
    .innerJoin(schema.users, eq(schema.users.id, schema.registrationCodes.createdBy))
    .orderBy(desc(schema.registrationCodes.createdAt))
    .limit(100)

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  }))
}

export async function listGuestTokens(): Promise<GuestTokenView[]> {
  const rows = await db
    .select({
      id: schema.guestTokens.id,
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

export interface AdminRoomView {
  readonly id: string
  readonly code: string
  readonly name: string
  readonly gameType: RoomGameType
  readonly status: 'waiting' | 'playing'
  readonly createdAt: string

  readonly memberCount: number
  readonly hostName: string
}

export async function listActiveRooms(): Promise<AdminRoomView[]> {
  const rows = await db
    .select({
      id: schema.rooms.id,
      code: schema.rooms.code,
      name: schema.rooms.name,
      gameType: schema.rooms.gameType,
      status: schema.rooms.status,
      createdAt: schema.rooms.createdAt,
      hostName: schema.users.displayName,
      memberCount: sql<number>`(
        select count(*)::int from ${schema.roomMembers}
        where ${schema.roomMembers.roomId} = ${schema.rooms.id}
          and ${schema.roomMembers.leftAt} is null
      )`,
    })
    .from(schema.rooms)
    .innerJoin(schema.users, eq(schema.users.id, schema.rooms.hostId))
    .where(inArray(schema.rooms.status, ['waiting', 'playing']))
    .orderBy(desc(schema.rooms.createdAt))
    .limit(100)

  return rows.flatMap((row) =>
    row.status === 'waiting' || row.status === 'playing'
      ? [
          {
            id: row.id,
            code: row.code,
            name: row.name,
            gameType: row.gameType,
            status: row.status,
            createdAt: row.createdAt.toISOString(),
            memberCount: row.memberCount,
            hostName: row.hostName,
          },
        ]
      : [],
  )
}

export interface AdminUserView {
  readonly id: string
  readonly displayName: string
  readonly username: string | null

  readonly phoneMasked: string | null
  readonly isAdmin: boolean
  readonly isGuest: boolean
  readonly authType: 'internal' | 'sso' | 'guest'
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
    isGuest: row.authentikSub.startsWith('guest:'),
    authType: row.authentikSub.startsWith('guest:') ? 'guest' : row.username ? 'internal' : 'sso',
    createdAt: row.createdAt.toISOString(),
  }))
}