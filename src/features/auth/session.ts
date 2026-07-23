import { auth } from '@/lib/auth'

/**
 * 현재 로그인 사용자의 내부 id. 없으면 null.
 * Server Action 은 이 값이 null 이면 즉시 실패를 반환한다 — middleware 는 UX 게이트일 뿐이다.
 */
export async function currentUserId(): Promise<string | null> {
  const session = await auth()
  return session?.user?.id ?? null
}
