import type { AdminUserView } from '../../admin-queries'
import type { MemberStatus } from '../../member-types'

export type AccountFilter = 'all' | 'internal' | 'sso' | 'guest'
export type RoleFilter = 'all' | 'admin' | 'member'
export type StatusFilter = 'all' | MemberStatus

export interface MemberQuery {
  readonly text: string
  readonly account: AccountFilter
  readonly role: RoleFilter
  readonly status: StatusFilter
}

/**
 * 기본값이 `active`인 것은 의도다. 삭제된 계정이 기본 목록에 섞이면 "회원 수"가
 * 실제 쓰는 사람 수와 어긋난다. 정지·삭제는 필터로 꺼내 본다.
 */
export const EMPTY_MEMBER_QUERY: MemberQuery = {
  text: '',
  account: 'all',
  role: 'all',
  status: 'active',
}

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

/** 검색어·계정 유형·권한·상태를 한 번에 적용한다. 입력 배열은 그대로 두고 새 배열을 만든다. */
export function filterMembers(
  users: readonly AdminUserView[],
  query: MemberQuery,
): readonly AdminUserView[] {
  const needle = query.text.trim().toLowerCase()
  return users.filter(
    (user) =>
      matchesText(user, needle) &&
      (query.account === 'all' || user.authType === query.account) &&
      (query.status === 'all' || user.status === query.status) &&
      matchesRole(user, query.role),
  )
}

/** 조건이 기본값에서 벗어났는지 — 빈 목록 안내와 초기화 버튼 노출에 쓴다. */
export function isMemberQueryActive(query: MemberQuery): boolean {
  return (
    query.text.trim() !== '' ||
    query.account !== EMPTY_MEMBER_QUERY.account ||
    query.role !== EMPTY_MEMBER_QUERY.role ||
    query.status !== EMPTY_MEMBER_QUERY.status
  )
}

/** 조건이 바뀌면 페이지를 1로 되돌리기 위한 키. */
export function memberQueryKey(query: MemberQuery): string {
  return `${query.text.trim().toLowerCase()}|${query.account}|${query.role}|${query.status}`
}
