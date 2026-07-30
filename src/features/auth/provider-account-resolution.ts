import { and, eq, sql } from 'drizzle-orm'
import { createUserGrantingFirstAdmin } from '@/features/auth/bootstrap'
import { LOCAL_SUB_PREFIX } from '@/features/auth/account-linkage'

/**
 * `src/lib/auth.ts`의 jwt 콜백이 로그인 성공 뒤 계정을 어떻게 찾거나 만들지 결정하는 로직.
 * Authentik과 게스트 토큰 provider가 공유한다(비밀번호 provider는 이미 계정이 확정돼 있어
 * 이 경로를 타지 않는다) — provider 자체의 인증 로직은 `@/lib/auth-providers`를 본다.
 */

/**
 * 내부 계정 자동 연결에 쓸 수 있는 힌트만 뽑는다.
 *
 * **`preferred_username`은 쓰지 않는다.** IdP 안에서만 의미 있는 식별자이고 사용자가 스스로
 * 바꿀 수 있는 경우가 많다 — 그 값으로 이 앱의 계정을 찾아 연결하면, 남의 아이디와 같은 값으로
 * Authentik 계정을 만든 사람이 SSO 로그인 한 번으로 그 계정을 가져갈 수 있다.
 *
 * 전화번호는 IdP가 **검증했다고 명시한 경우에만**(`phone_number_verified === true`) 신뢰한다.
 * 검증 플래그가 없으면 힌트가 없는 것으로 취급하고 별도 계정을 만든다(아래 fallback).
 */
export function mergeHints(profile: unknown): { phone: string | null } {
  if (!profile || typeof profile !== 'object') return { phone: null }
  const p = profile as { phone_number?: unknown; phone_number_verified?: unknown }
  if (p.phone_number_verified !== true) return { phone: null }
  const phoneDigits = typeof p.phone_number === 'string' ? p.phone_number.replace(/\D/g, '') : null
  return { phone: phoneDigits && phoneDigits.length >= 9 ? phoneDigits : null }
}

export async function resolveProviderUser(input: {
  sub: string
  displayName: string
  avatarUrl: string | null
  hints: { phone: string | null }
}): Promise<{ id: string }> {
  const { sub, displayName, avatarUrl, hints } = input
  const { db, schema } = await import('@/lib/db')

  const [bySub] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.authentikSub, sub), eq(schema.users.isManaged, false)))
    .limit(1)
  if (bySub) {
    await db
      .update(schema.users)
      .set({ displayName, avatarUrl })
      .where(eq(schema.users.id, bySub.id))
    return bySub
  }

  if (hints.phone) {
    // 아직 어떤 Authentik 계정에도 연결되지 않은 계정만 후보다. 이 조건이 없으면 이미 다른
    // sub에 연결된 계정까지 덮어써서 가로챌 수 있다. 후보가 둘 이상이면 연결하지 않는다.
    //
    // "미연결"은 SQL NULL이 아니라 `local:{username}` 센티널이다 — `authentik_sub`가
    // NOT NULL이라 `IS NULL`로 쓰면 조건이 항상 거짓이 되어 이 경로가 조용히 죽는다.
    // 판정 정의는 `account-linkage.ts`에만 둔다.
    const unlinkedAccount = sql`${schema.users.authentikSub} = ${LOCAL_SUB_PREFIX} || ${schema.users.username}`
    const matches = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(eq(schema.users.phone, hints.phone), eq(schema.users.isManaged, false), unlinkedAccount),
      )
      .limit(2)

    const [onlyMatch] = matches
    if (matches.length === 1 && onlyMatch) {
      // UPDATE에도 같은 조건을 걸어 조회와 쓰기 사이에 끼어든 연결을 덮어쓰지 않는다.
      const [linked] = await db
        .update(schema.users)
        .set({ authentikSub: sub, displayName, avatarUrl })
        .where(and(eq(schema.users.id, onlyMatch.id), unlinkedAccount))
        .returning({ id: schema.users.id })
      if (linked) {
        // 계정 소유권이 옮겨가는 사건이라 사후 추적이 가능해야 한다.
        console.warn('sso account linked by verified phone:', { userId: linked.id })
        return linked
      }
    }
  }

  try {
    return await createUserGrantingFirstAdmin({ authentikSub: sub, displayName, avatarUrl })
  } catch (error) {
    const isUniqueViolation =
      typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
    if (!isUniqueViolation) throw error

    const [createdByConcurrentRequest] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.authentikSub, sub))
      .limit(1)
    if (createdByConcurrentRequest) return createdByConcurrentRequest
    throw error
  }
}
