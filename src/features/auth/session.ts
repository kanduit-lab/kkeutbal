import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db, schema } from '@/lib/db'

/**
 * 로그인한 계정 id — **활성 상태일 때만.**
 *
 * 세션이 JWT라 발급 뒤 3일간 유효하다. 그 사이에 정지·삭제된 계정은 토큰만으로는
 * 걸러지지 않으므로 여기서 매번 확인한다. 모든 서버 액션이 이 함수를 통과하기 때문에
 * 이 한 곳이 곧 쓰기 차단 지점이다.
 */
export async function currentUserId(): Promise<string | null> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return null
  return (await isActiveUser(userId)) ? userId : null
}

export async function isActiveUser(userId: string): Promise<boolean> {
  try {
    const [row] = await db
      .select({ status: schema.users.status })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1)
    return row?.status === 'active'
  } catch (error) {
    console.error('isActiveUser failed:', error)
    return false
  }
}