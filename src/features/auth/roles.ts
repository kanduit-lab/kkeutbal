import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { serverEnv } from '@/lib/env'

/**
 * 관리자 판정 — DB `is_admin` 또는 `AUTH_ADMIN_USERNAMES` 부트스트랩 목록.
 *
 * 정상 경로는 DB `is_admin` 이다. 계정이 하나도 없는 인스턴스에서는 첫 가입자가
 * 자동으로 관리자가 되므로(`registerAndLogin`, `bootstrap.ts`) 신규 설치에 env 는 필요 없다.
 * `AUTH_ADMIN_USERNAMES` 는 관리자가 전부 잠겼을 때만 쓰는 비상 복구용 탈출구로 남긴다.
 */
export async function isAdminUser(userId: string): Promise<boolean> {
  try {
    const [row] = await db
      .select({ isAdmin: schema.users.isAdmin, username: schema.users.username })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1)
    if (!row) return false
    if (row.isAdmin) return true
    if (!row.username) return false

    const bootstrapped = serverEnv()
      .AUTH_ADMIN_USERNAMES.split(',')
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean)
    return bootstrapped.includes(row.username)
  } catch (error) {
    // 마이그레이션 전(컬럼 부재) 등 조회 실패는 비관리자로 취급한다 — 홈 렌더를 막지 않는다.
    console.error('isAdminUser failed:', error)
    return false
  }
}
