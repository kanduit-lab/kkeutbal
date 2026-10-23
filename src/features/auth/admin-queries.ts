import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type { RoomGameType } from '@/features/game/types'
import type { MemberStatus } from './member-types'

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

export interface AdminAccessPage<T> {
  readonly items: readonly T[]
  readonly total: number
}

export interface AdminAccessPageQuery {
  readonly page: number
  readonly pageSize: number
}

export async function listRegistrationCodesPage(
  query: AdminAccessPageQuery,
): Promise<AdminAccessPage<RegistrationCodeView>> {
  const [rows, counts] = await Promise.all([
    db
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
      .limit(query.pageSize)
      .offset(query.page * query.pageSize),
    db.select({ count: sql<number>`count(*)::int` }).from(schema.registrationCodes),
  ])

  return {
    total: counts[0]?.count ?? 0,
    items: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
    })),
  }
}

export async function listGuestTokensPage(
  query: AdminAccessPageQuery,
): Promise<AdminAccessPage<GuestTokenView>> {
  const [rows, counts] = await Promise.all([
    db
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
      .limit(query.pageSize)
      .offset(query.page * query.pageSize),
    db.select({ count: sql<number>`count(*)::int` }).from(schema.guestTokens),
  ])

  return {
    total: counts[0]?.count ?? 0,
    items: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
    })),
  }
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

export interface AdminRoomPage {
  readonly rooms: readonly AdminRoomView[]
  readonly total: number
}

export interface AdminRoomPageQuery {
  readonly text: string
  readonly status: 'all' | 'waiting' | 'playing'
  readonly page: number
  readonly pageSize: number
}

function likePattern(text: string): string {
  return `%${text.trim().replace(/[\\%_]/g, '\\$&')}%`
}

function roomFilters(query: Pick<AdminRoomPageQuery, 'text' | 'status'>) {
  const filters = []
  const text = query.text.trim()
  if (text) {
    const pattern = likePattern(text)
    filters.push(
      or(
        ilike(schema.rooms.code, pattern),
        ilike(schema.rooms.name, pattern),
        ilike(schema.users.displayName, pattern),
      ),
    )
  }
  filters.push(
    query.status === 'all'
      ? inArray(schema.rooms.status, ['waiting', 'playing'])
      : eq(schema.rooms.status, query.status),
  )
  return and(...filters)
}

/**
 * 일괄 작업에서 방 하나가 실패한 이유. 일괄 처리는 방마다 트랜잭션이 따로라
 * 일부만 실패할 수 있고, 무엇이 왜 실패했는지가 그 다음 조치를 정한다.
 */
export interface AdminBulkFailure {
  readonly roomId: string
  readonly error: string
}

/**
 * 목록이 상한(`ACTIVE_ROOMS_LIMIT`)에 걸렸는지 알기 위한 실제 전체 수. 일괄 정산을 돌리고도
 * "100건"이 그대로면 아무 일도 안 일어난 것처럼 보이는데, 실제로는 상한 뒤에 밀려 있던 방이
 * 그 자리를 채운 것이다 — 화면이 잘린 목록임을 말해야 그 오해가 사라진다.
 */
const ACTIVE_ROOMS_LIMIT = 100

export async function countActiveRooms(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.rooms)
    .where(inArray(schema.rooms.status, ['waiting', 'playing']))
  return row?.count ?? 0
}

export async function listActiveRooms(): Promise<AdminRoomView[]> {
  const page = await listActiveRoomsPage({
    text: '',
    status: 'all',
    page: 0,
    pageSize: ACTIVE_ROOMS_LIMIT,
  })
  return [...page.rooms]
}

export async function listActiveRoomsPage(
  query: AdminRoomPageQuery,
): Promise<AdminRoomPage> {
  const offset = query.page * query.pageSize
  const filters = roomFilters(query)
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
    .where(filters)
    .orderBy(desc(schema.rooms.createdAt))
    .limit(query.pageSize)
    .offset(offset)

  const [count] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.rooms)
    .innerJoin(schema.users, eq(schema.users.id, schema.rooms.hostId))
    .where(filters)

  return {
    total: count?.count ?? 0,
    rooms: rows.flatMap((row) =>
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
    ),
  }
}

export interface AdminUserView {
  readonly id: string
  readonly displayName: string
  readonly username: string | null

  readonly phoneMasked: string | null
  readonly isAdmin: boolean
  readonly isGuest: boolean
  readonly authType: 'internal' | 'sso' | 'guest'
  readonly status: MemberStatus
  readonly statusReason: string | null

  /** 크레딧 계정이 아직 없으면 0. 잔액을 모르고 지급하면 회수 폭을 가늠할 수 없다. */
  readonly availableBalance: number
  readonly lockedBalance: number
  readonly createdAt: string
}

const USERS_LIMIT = 200

/** 목록이 상한에 걸렸는지 알려면 실제 전체 수가 필요하다 — 방 목록과 같은 이유. */
export async function countUsers(): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.users)
  return row?.count ?? 0
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
      status: schema.users.status,
      statusReason: schema.users.statusReason,
      createdAt: schema.users.createdAt,
      availableBalance: schema.creditAccounts.availableBalance,
      lockedBalance: schema.creditAccounts.lockedBalance,
    })
    .from(schema.users)
    .leftJoin(schema.creditAccounts, eq(schema.creditAccounts.userId, schema.users.id))
    .orderBy(desc(schema.users.createdAt))
    .limit(USERS_LIMIT)

  return rows.map((row) => {
    const isGuest = row.authentikSub.startsWith('guest:')
    return {
      id: row.id,
      displayName: row.displayName,
      username: row.username,
      phoneMasked: row.phone ? `****${row.phone.slice(-4)}` : null,
      isAdmin: row.isAdmin,
      isGuest,
      authType: isGuest ? 'guest' : row.username ? 'internal' : 'sso',
      status: row.status,
      statusReason: row.statusReason,
      availableBalance: row.availableBalance ?? 0,
      lockedBalance: row.lockedBalance ?? 0,
      createdAt: row.createdAt.toISOString(),
    }
  })
}
