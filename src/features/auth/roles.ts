import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

/** 관리자 판정은 DB의 `users.is_admin`만 사용한다. */
export async function isAdminUser(userId: string): Promise<boolean> {
  try {
    const [row] = await db
      .select({ isAdmin: schema.users.isAdmin })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1)
    return row?.isAdmin ?? false
  } catch (error) {
    // 마이그레이션 전(컬럼 부재) 등 조회 실패는 비관리자로 취급한다 — 홈 렌더를 막지 않는다.
    console.error('isAdminUser failed:', error)
    return false
  }
}
