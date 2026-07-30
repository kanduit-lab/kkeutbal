import type { AdminUserView } from '../../admin-queries'

export type AccountFilter = 'all' | 'internal' | 'sso' | 'guest'
export type RoleFilter = 'all' | 'admin' | 'member'

export interface MemberQuery {
  readonly text: string
  readonly account: AccountFilter
  readonly role: RoleFilter
}

export const EMPTY_MEMBER_QUERY: MemberQuery = { text: '', account: 'all', role: 'all' }

function matchesText(user: AdminUserView, needle: string): boolean {
  if (needle === '') return true
  return [user.displayName, user.username ?? '', user.phoneMasked ?? ''].some((value) =>
    value.toLowerCase().includes(needle),
  )
}

function matchesRole(user: AdminUserView, role: RoleFilter): boolean {
  if (role === 'all') return true
  return role === 'admin' ? user.isAdmin : !user.isAdmin
}

/** 검색어·계정 유형·권한을 한 번에 적용한다. 입력 배열은 그대로 두고 새 배열을 만든다. */
export function filterMembers(
  users: readonly AdminUserView[],
  query: MemberQuery,
): readonly AdminUserView[] {
  const needle = query.text.trim().toLowerCase()
  if (needle === '' && query.account === 'all' && query.role === 'all') return users
  return users.filter(
    (user) =>
      matchesText(user, needle) &&
      (query.account === 'all' || user.authType === query.account) &&
      matchesRole(user, query.role),
  )
}

/** 조건이 하나라도 걸려 있는지 — 빈 목록 안내와 초기화 버튼 노출에 쓴다. */
export function isMemberQueryActive(query: MemberQuery): boolean {
  return query.text.trim() !== '' || query.account !== 'all' || query.role !== 'all'
}

/** 조건이 바뀌면 페이지를 1로 되돌리기 위한 키. */
export function memberQueryKey(query: MemberQuery): string {
  return `${query.text.trim().toLowerCase()}|${query.account}|${query.role}`
}
