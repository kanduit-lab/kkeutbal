import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemberSheet } from '@/features/game/components/member-sheet'
import type { RunAction } from '@/features/game/components/shared'
import type { MemberRole, RoomGameType } from '@/features/game/types'
import { buildRoomSnapshot, buildStandardTable, findByRole } from './fixtures/room-snapshot'
import { ko, renderWithProviders } from './render-helpers'

/**
 * `MemberSheet`는 좌석을 탭하면 뜨는 시트다 — 자기 좌석이냐 남의 좌석이냐, 베팅 게임이냐
 * 고스톱이냐, 보는 사람이 딜러냐에 따라 내용이 갈린다(member-sheet-gating.ts). 숨기는 대신
 * "왜 안 되는지"를 보여주는 ui-permission-gating 패턴이라, 막힌 경우에도 화면이 비면 안 된다.
 *
 * next/navigation의 useRouter는 App Router 컨텍스트 밖에서 부르면 던진다 — 테스트에서는
 * next/navigation 자체를 mock한다. 서버 액션 모듈도 game-role-rendering.test.tsx와 같은
 * 이유로 mock한다(DB에 안 붙어야 한다).
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/features/betting/actions', () => ({ placeBet: vi.fn() }))
vi.mock('@/features/budget/actions', () => ({ addBuyIn: vi.fn(), undoLastBuyIn: vi.fn() }))
vi.mock('@/features/game/member-actions', () => ({
  leaveRoom: vi.fn(),
  removeMember: vi.fn(),
  transferHost: vi.fn(),
  setMemberRole: vi.fn(),
}))

afterEach(() => cleanup())

const noopRunAction: RunAction = async () => true

function renderSheet({
  gameType,
  viewerRole,
  targetRole,
  hasRound = true,
}: {
  gameType: RoomGameType
  viewerRole: MemberRole
  targetRole: MemberRole
  hasRound?: boolean
}) {
  const members = buildStandardTable()
  const viewer = findByRole(members, viewerRole)
  const target = findByRole(members, targetRole)
  const snapshot = buildRoomSnapshot({ gameType, members, hasRound })
  return renderWithProviders(
    <MemberSheet
      open
      member={target}
      snapshot={snapshot}
      selfId={viewer.userId}
      runAction={noopRunAction}
      onClose={() => {}}
    />,
  )
}

const ROLES: readonly MemberRole[] = ['host', 'dealer', 'player', 'observer']

describe('MemberSheet — 자기 좌석을 볼 때 (모든 역할 × 베팅 게임/고스톱)', () => {
  for (const role of ROLES) {
    it(`${role}가 섯다에서 자기 좌석을 보면 화면이 안 비고, 잔액·손익이 보인다`, () => {
      renderSheet({ gameType: 'seotda', viewerRole: role, targetRole: role })
      expect(screen.getByText(ko.memberSheet.statBalance)).toBeTruthy()
      expect(screen.getByText(ko.memberSheet.statNet)).toBeTruthy()
      if (role === 'observer') {
        expect(screen.getByText(ko.memberSheet.observerNoBetting)).toBeTruthy()
      } else {
        expect(screen.getByText(ko.memberSheet.selfBetReadyHint)).toBeTruthy()
        expect(screen.getByText(ko.memberSheet.selfBetGoToActionBar)).toBeTruthy()
      }
    })

    it(`${role}가 고스톱에서 자기 좌석을 보면 "베팅 대신 점수" 안내를 본다`, () => {
      renderSheet({ gameType: 'gostop', viewerRole: role, targetRole: role })
      expect(screen.getByText(ko.memberSheet.gostopNoBetting)).toBeTruthy()
    })
  }
})

describe('MemberSheet — 남의 좌석을 볼 때 (대리 입력 게이팅)', () => {
  it('딜러가 섯다에서 플레이어 좌석을 보면 대리 베팅 버튼이 보인다', () => {
    renderSheet({ gameType: 'seotda', viewerRole: 'dealer', targetRole: 'player' })
    const proxySection = screen.getByText(ko.memberSheet.proxyTitle).closest('section')
    expect(proxySection).toBeTruthy()
    expect(within(proxySection as HTMLElement).getByText(ko.bet.seotda.raise)).toBeTruthy()
    expect(within(proxySection as HTMLElement).getByText(ko.bet.seotda.fold)).toBeTruthy()
  })

  it('딜러가 아닌 플레이어가 남의 좌석을 보면 "딜러만 대신 베팅" 안내가 뜬다 (숨기지 않는다)', () => {
    renderSheet({ gameType: 'seotda', viewerRole: 'player', targetRole: 'host' })
    expect(screen.getByText(ko.memberSheet.proxyDealerOnly)).toBeTruthy()
  })

  it('딜러가 관전자 좌석을 보면 "관전자는 베팅하지 않아요" 안내가 뜬다', () => {
    renderSheet({ gameType: 'seotda', viewerRole: 'host', targetRole: 'observer' })
    expect(screen.getByText(ko.memberSheet.observerNoBetting)).toBeTruthy()
  })

  it('고스톱에서는 딜러가 봐도 대리 베팅 대신 "베팅 대신 점수" 안내가 뜬다', () => {
    renderSheet({ gameType: 'gostop', viewerRole: 'host', targetRole: 'player' })
    expect(screen.getByText(ko.memberSheet.gostopNoBetting)).toBeTruthy()
  })

  it('판이 없으면 대리 베팅 대신 "판이 시작되면" 안내 + 딜러 힌트가 뜬다', () => {
    renderSheet({ gameType: 'seotda', viewerRole: 'host', targetRole: 'player', hasRound: false })
    expect(screen.getByText(ko.memberSheet.proxyNoRound)).toBeTruthy()
    expect(screen.getByText(ko.memberSheet.noRoundDealerHint)).toBeTruthy()
  })
})
