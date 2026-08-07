import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminUserView } from '@/features/auth/admin-queries'
import { ko, renderWithProviders } from './render-helpers'

/**
 * 회원 관리 표의 규약.
 *
 * 개별 조작(프로필·비밀번호·정지·삭제·크레딧)은 전부 상세 다이얼로그로 들어가고, 표에는
 * 여러 명을 훑고 고르는 일만 남는다. 여기서 지키는 것은 두 가지다 —
 * 기본 목록이 활성 계정만 보여준다는 것과, 되돌리기 어려운 일괄 정지가 사유 없이는
 * 확정되지 않는다는 것.
 */

const setAdminBulk = vi.fn()
const setMemberStatus = vi.fn()

// 서버 액션 모듈은 next-auth를 타고 들어가 jsdom에서 로드되지 않는다. 이 테스트가 보는 것은
// 화면이 어떤 인자로 무엇을 부르는가이므로 경계에서 끊는다.
vi.mock('@/features/auth/member-actions', () => ({
  setAdminBulk: (...args: unknown[]) => setAdminBulk(...args),
  setMemberStatus: (...args: unknown[]) => setMemberStatus(...args),
  getMemberDetail: vi.fn(),
  resetMemberPassword: vi.fn(),
  updateMemberProfile: vi.fn(),
}))

vi.mock('@/features/wallet/actions', () => ({
  adminAdjustCredits: vi.fn(),
  getMyCreditWallet: vi.fn(),
}))

const { MembersPanel } = await import('@/features/auth/components/admin/members-panel')

afterEach(cleanup)

function user(overrides: Partial<AdminUserView> & { id: string }): AdminUserView {
  return {
    displayName: '홍길동',
    username: 'hong',
    phoneMasked: '****5678',
    isAdmin: false,
    isGuest: false,
    authType: 'internal',
    status: 'active',
    statusReason: null,
    availableBalance: 1000,
    lockedBalance: 0,
    createdAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

const USERS: readonly AdminUserView[] = [
  user({ id: 'a', displayName: '홍길동', username: 'hong' }),
  user({ id: 'b', displayName: '김철수', username: 'chulsoo' }),
  user({ id: 'c', displayName: '정지된 사람', username: 'banned', status: 'suspended' }),
]

beforeEach(() => {
  setAdminBulk.mockReset()
  setMemberStatus.mockReset()
  // `useIsDesktop`은 matchMedia를 쓴다. jsdom에는 없으므로 모바일로 고정한다.
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  )
  // jsdom은 레이아웃을 계산하지 않아 `clientHeight`가 항상 0이고, `usePagedRows`가
  // 한 줄만 남긴다. 모든 회원이 한 페이지에 들어갈 만큼 높이를 준다.
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 800,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight')
})

function renderPanel() {
  const onDataChanged = vi.fn()
  renderWithProviders(
    <MembersPanel users={USERS} total={USERS.length} selfId="a" onDataChanged={onDataChanged} />,
  )
  return { onDataChanged }
}

/**
 * 데스크톱 표와 모바일 카드는 `hidden lg:block`으로 갈리는데, jsdom은 Tailwind CSS를 적용하지
 * 않아 둘 다 접근성 트리에 남는다. 같은 회원의 체크박스가 두 개라 첫 번째만 쓴다.
 */
function selectRow(name: string) {
  const boxes = screen.getAllByRole('checkbox', {
    name: ko.adminConsole.members.selectRowAria.replace('{name}', name),
  })
  fireEvent.click(boxes[0]!)
}

describe('MembersPanel — 기본 목록', () => {
  it('정지된 계정은 기본 목록에서 빠진다', () => {
    renderPanel()

    expect(screen.getAllByText('홍길동').length).toBeGreaterThan(0)
    expect(screen.getAllByText('김철수').length).toBeGreaterThan(0)
    expect(screen.queryByText('정지된 사람')).toBeNull()
  })

  it('상태 필터를 전체로 바꾸면 정지 계정이 보인다', () => {
    renderPanel()

    fireEvent.change(screen.getByLabelText(ko.adminConsole.members.filterStatusLabel), {
      target: { value: 'all' },
    })

    expect(screen.getAllByText('정지된 사람').length).toBeGreaterThan(0)
  })
})

describe('MembersPanel — 일괄 작업', () => {
  it('선택 전에는 일괄 조작 막대가 없다', () => {
    renderPanel()
    expect(screen.queryByText(ko.adminConsole.members.clearSelection)).toBeNull()
  })

  it('일괄 정지는 사유를 입력해야 확정된다', async () => {
    setMemberStatus.mockResolvedValue({ success: true, data: { changed: ['b'], failed: [] } })
    renderPanel()

    selectRow('김철수')
    fireEvent.click(screen.getByRole('button', { name: ko.adminConsole.memberDetail.suspend }))

    // 확인 다이얼로그의 확정 버튼은 사유가 빌 동안 눌리지 않는다.
    const confirm = screen.getAllByRole('button', {
      name: ko.adminConsole.memberDetail.suspend,
    })
    const dialogConfirm = confirm[confirm.length - 1]!
    fireEvent.click(dialogConfirm)
    expect(setMemberStatus).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(ko.adminConsole.memberDetail.reasonLabel), {
      target: { value: '약관 위반' },
    })
    fireEvent.click(dialogConfirm)

    await waitFor(() => expect(setMemberStatus).toHaveBeenCalledTimes(1))
    expect(setMemberStatus).toHaveBeenCalledWith({
      targetUserIds: ['b'],
      status: 'suspended',
      reason: '약관 위반',
    })
  })

  it('관리자 일괄 지정은 사유 없이 바로 보낸다', async () => {
    setAdminBulk.mockResolvedValue({ success: true, data: { changed: ['b'], failed: [] } })
    renderPanel()

    selectRow('김철수')
    fireEvent.click(screen.getByRole('button', { name: ko.adminConsole.permissions.grant }))
    fireEvent.click(screen.getByRole('button', { name: ko.adminConsole.permissions.grantConfirm }))

    await waitFor(() => expect(setAdminBulk).toHaveBeenCalledTimes(1))
    expect(setAdminBulk).toHaveBeenCalledWith({ targetUserIds: ['b'], isAdmin: true })
  })

  it('일부 실패하면 사유를 회원 이름과 함께 남긴다', async () => {
    setAdminBulk.mockResolvedValue({
      success: true,
      data: { changed: [], failed: [{ userId: 'b', error: 'errors.guestCannotBeAdmin' }] },
    })
    renderPanel()

    selectRow('김철수')
    fireEvent.click(screen.getByRole('button', { name: ko.adminConsole.permissions.grant }))
    fireEvent.click(screen.getByRole('button', { name: ko.adminConsole.permissions.grantConfirm }))

    await waitFor(() =>
      expect(screen.getByText(ko.errors.guestCannotBeAdmin, { exact: false })).toBeTruthy(),
    )
    expect(screen.getByText(ko.adminConsole.members.bulkFailedTitle.replace('{n}', '1'))).toBeTruthy()
  })
})
