/**
 * 내부 계정과 Authentik sub의 연결 상태 판정 — **한 곳에만 둔다.**
 *
 * `users.authentik_sub`는 `NOT NULL`이다(`drizzle/schema.ts`). 그래서 "아직 SSO에 연결되지
 * 않은 내부 계정"은 SQL NULL이 아니라 `local:{username}` 센티널을 갖는다. 이걸 모르고
 * `IS NULL`로 미연결을 찾으면 조건이 **항상 거짓**이 되어 코드가 조용히 죽는다 — 실제로
 * 그런 상태였고, SSO 연결 흐름을 만들다가 드러났다.
 *
 * 자동 연결(`resolveProviderUser`)과 명시적 연결(`sso-link-actions.ts`)이 서로 다른 정의를
 * 쓰면 한쪽이 허용하는 계정을 다른 쪽이 거부하는 상태가 생긴다. 그래서 센티널 포맷과 판정을
 * 여기서만 정의한다.
 */

export const LOCAL_SUB_PREFIX = 'local:'

/** 비밀번호 계정이 갖는 센티널 sub. 회원가입 시 이 값으로 만들어진다. */
export function localSubFor(username: string): string {
  return `${LOCAL_SUB_PREFIX}${username}`
}

/**
 * 이 계정이 아직 어떤 Authentik 계정에도 연결되지 않았는지.
 * `username`이 없는 계정(SSO 전용·게스트)은 센티널을 가질 수 없으므로 항상 false다.
 */
export function isAccountUnlinked(row: {
  username: string | null
  authentikSub: string
}): boolean {
  return row.username !== null && row.authentikSub === localSubFor(row.username)
}
