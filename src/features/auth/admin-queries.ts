import { desc, eq, inArray, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type { RoomGameType } from '@/features/game/types'

/** 관리자 페이지 전용 조회. 호출 전 isAdminUser 게이트를 통과해야 한다. */

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

/** 가입코드 원문은 저장하지 않으므로 목록에는 운영 메타데이터만 표시한다. */
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
  /** leftAt 이 없는 활성 멤버 수. */
  readonly memberCount: number
  readonly hostName: string
}

/** 진행 중(waiting·playing)인 방 목록 — 방치된 방 강제 정산 판단용. */
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

  // where 절이 이미 걸러내지만 drizzle 타입은 좁혀지지 않는다 — 캐스트 대신 런타임 좁히기.
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
  /** 뒷자리 4자리만 노출한다. */
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
