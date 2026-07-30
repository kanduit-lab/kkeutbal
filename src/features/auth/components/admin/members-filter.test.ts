import { describe, it, expect } from 'vitest'
import type { AdminUserView } from '../../admin-queries'
import {
  EMPTY_MEMBER_QUERY,
  filterMembers,
  isMemberQueryActive,
  memberQueryKey,
  type MemberQuery,
} from './members-filter'

function user(overrides: Partial<AdminUserView> & { id: string }): AdminUserView {
  return {
    displayName: '홍길동',
    username: 'hong',
    phoneMasked: '****5678',
    isAdmin: false,
    isGuest: false,
    authType: 'internal',
    createdAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

const USERS: readonly AdminUserView[] = [
  user({ id: 'a', displayName: '홍길동', username: 'hong', isAdmin: true }),
  user({ id: 'b', displayName: '김철수', username: 'chulsoo', phoneMasked: '****1234' }),
  user({ id: 'c', displayName: '게스트 손님', username: null, phoneMasked: null, isGuest: true, authType: 'guest' }),
  user({ id: 'd', displayName: 'SSO 사용자', username: 'sso-user', authType: 'sso' }),
]

function query(overrides: Partial<MemberQuery> = {}): MemberQuery {
  return { ...EMPTY_MEMBER_QUERY, ...overrides }
}

describe('filterMembers', () => {
  it('조건이 없으면 원본을 그대로 돌려준다', () => {
    expect(filterMembers(USERS, EMPTY_MEMBER_QUERY)).toBe(USERS)
  })

  it('이름으로 찾는다', () => {
    expect(filterMembers(USERS, query({ text: '김철' })).map((u) => u.id)).toEqual(['b'])
  })

  it('아이디로 찾는다', () => {
    expect(filterMembers(USERS, query({ text: 'chul' })).map((u) => u.id)).toEqual(['b'])
  })

  it('전화 뒷자리로 찾는다', () => {
    expect(filterMembers(USERS, query({ text: '1234' })).map((u) => u.id)).toEqual(['b'])
  })

  it('대소문자를 구분하지 않는다', () => {
    expect(filterMembers(USERS, query({ text: 'HONG' })).map((u) => u.id)).toEqual(['a'])
  })

  it('앞뒤 공백을 무시한다', () => {
    expect(filterMembers(USERS, query({ text: '  hong  ' })).map((u) => u.id)).toEqual(['a'])
  })

  it('계정 유형으로 걸러낸다', () => {
    expect(filterMembers(USERS, query({ account: 'guest' })).map((u) => u.id)).toEqual(['c'])
    expect(filterMembers(USERS, query({ account: 'sso' })).map((u) => u.id)).toEqual(['d'])
  })

  it('권한으로 걸러낸다', () => {
    expect(filterMembers(USERS, query({ role: 'admin' })).map((u) => u.id)).toEqual(['a'])
    expect(filterMembers(USERS, query({ role: 'member' })).map((u) => u.id)).toEqual(['b', 'c', 'd'])
  })

  it('검색어와 필터를 함께 적용한다', () => {
    expect(filterMembers(USERS, query({ text: 'hong', role: 'member' }))).toEqual([])
    expect(filterMembers(USERS, query({ text: 'hong', role: 'admin' })).map((u) => u.id)).toEqual([
      'a',
    ])
  })

  it('입력 배열을 변형하지 않는다', () => {
    const before = [...USERS]
    filterMembers(USERS, query({ text: 'hong' }))
    expect(USERS).toEqual(before)
  })
})

describe('isMemberQueryActive', () => {
  it('빈 조건은 비활성', () => {
    expect(isMemberQueryActive(EMPTY_MEMBER_QUERY)).toBe(false)
    expect(isMemberQueryActive(query({ text: '   ' }))).toBe(false)
  })

  it('검색어나 필터 하나라도 걸리면 활성', () => {
    expect(isMemberQueryActive(query({ text: 'a' }))).toBe(true)
    expect(isMemberQueryActive(query({ account: 'guest' }))).toBe(true)
    expect(isMemberQueryActive(query({ role: 'admin' }))).toBe(true)
  })
})

describe('memberQueryKey', () => {
  it('같은 조건은 같은 키', () => {
    expect(memberQueryKey(query({ text: ' Hong ' }))).toBe(memberQueryKey(query({ text: 'hong' })))
  })

  it('다른 조건은 다른 키', () => {
    expect(memberQueryKey(query({ role: 'admin' }))).not.toBe(
      memberQueryKey(query({ role: 'member' })),
    )
  })
})
