import { and, eq } from 'drizzle-orm'
import { isAccountUnlinked } from '@/features/auth/account-linkage'
import type { SsoLinkResult } from '@/features/auth/sso-link-cookies'

/**
 * 로그인한 사용자가 `/account`에서 시작한 연결 요청을 처리한다. `resolveProviderUser`
 * (`@/features/auth/provider-account-resolution`)와 근본적으로 다른 점: **새 계정을 만들지
 * 않는다.** `consumeSsoLinkIntent()`가 돌려준 세션 유래 사용자 id에만 sub를 붙이거나,
 * 아니면 아무것도 바꾸지 않고 거부한다.
 *
 * 이 함수는 `src/lib/auth.ts`의 jwt 콜백에서만 호출된다 — 실제 OAuth 콜백이 도착한 뒤
 * 최종 판정을 여기서 내린다는 뜻이다(`sso-link-actions.ts`의 `beginSsoLink`는 선제
 * 확인일 뿐 최종 판정이 아니다. 자세한 이유는 그 파일의 주석을 본다).
 *
 * 거부 조건 둘 (요청에서 지정한 그대로):
 * - 이 sub가 **이미 다른 계정**에 연결돼 있다 → 계정 합치기가 아니므로 거부
 *   (`already_linked_elsewhere`).
 * - 대상 계정에 **이미 다른 sub**가 연결돼 있다(게스트·SSO 전용·동시 요청 경쟁 포함) →
 *   덮어쓰지 않고 거부(`account_already_linked`).
 *
 * 두 UPDATE 모두 이전 값을 WHERE 절에 넣어 조건부로 실행해 동시 요청 경쟁을 좁히고,
 * `users.authentik_sub` UNIQUE 제약이 DB 레벨에서 한 번 더 막는다(23505 catch).
 *
 * 표시 이름·아바타는 **의도적으로 덮어쓰지 않는다** — 이미 계정 설정에서 관리하는 값이라,
 * "SSO 연결"이라는 이 행동만으로 조용히 바뀌면 사용자가 놀랄 수 있다. 자동 병합 경로
 * (`resolveProviderUser`)의 기존 동작과는 다른 선택이니 리뷰에서 다시 확인할 가치가 있다.
 */
export async function linkAuthentikSubToAccount(input: {
  targetUserId: string
  sub: string
}): Promise<{ result: SsoLinkResult; displayName: string | null }> {
  const { targetUserId, sub } = input
  const { db, schema } = await import('@/lib/db')

  const [bySub] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.authentikSub, sub), eq(schema.users.isManaged, false)))
    .limit(1)

  if (bySub && bySub.id !== targetUserId) {
    console.warn('sso link rejected: sub already linked to a different account', { targetUserId })
    return { result: { status: 'rejected', reason: 'already_linked_elsewhere' }, displayName: null }
  }

  const [target] = await db
    .select({
      authentikSub: schema.users.authentikSub,
      username: schema.users.username,
      isManaged: schema.users.isManaged,
      displayName: schema.users.displayName,
    })
    .from(schema.users)
    .where(eq(schema.users.id, targetUserId))
    .limit(1)
  if (!target) {
    console.warn('sso link rejected: target account not found', { targetUserId })
    return { result: { status: 'rejected', reason: 'account_already_linked' }, displayName: null }
  }

  if (bySub && bySub.id === targetUserId) {
    // 이미 같은 계정에 연결돼 있다 — 아무것도 바꾸지 않고 성공(멱등)으로 취급한다.
    return { result: { status: 'linked' }, displayName: target.displayName }
  }

  // username이 없으면 게스트 또는 이미 SSO 전용인 계정 — 둘 다 연결 대상이 아니다.
  const eligible = !target.isManaged && isAccountUnlinked(target)
  if (!eligible) {
    console.warn('sso link rejected: target account not eligible', { targetUserId })
    return {
      result: { status: 'rejected', reason: 'account_already_linked' },
      displayName: target.displayName,
    }
  }

  try {
    const [linked] = await db
      .update(schema.users)
      .set({ authentikSub: sub })
      .where(and(eq(schema.users.id, targetUserId), eq(schema.users.authentikSub, target.authentikSub)))
      .returning({ id: schema.users.id })
    if (!linked) {
      console.warn('sso link rejected: concurrent update on target account', { targetUserId })
      return {
        result: { status: 'rejected', reason: 'account_already_linked' },
        displayName: target.displayName,
      }
    }
    console.warn('sso account linked by logged-in user request:', { userId: linked.id })
    return { result: { status: 'linked' }, displayName: target.displayName }
  } catch (error) {
    const isUniqueViolation =
      typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
    if (isUniqueViolation) {
      console.warn('sso link rejected: sub uniqueness race', { targetUserId })
      return {
        result: { status: 'rejected', reason: 'already_linked_elsewhere' },
        displayName: target.displayName,
      }
    }
    throw error
  }
}
