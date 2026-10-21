import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActionBar } from '@/features/game/components/action-bar'
import { DealerQuickBar } from '@/features/game/components/dealer-quick-bar'
import { ObserverStatusPanel } from '@/features/game/components/observer-status-panel'
import { GostopWaitPanel } from '@/features/game/components/gostop-wait-panel'
import type { RunAction } from '@/features/game/components/shared'
import type { MemberRole, RoomGameType } from '@/features/game/types'
import { buildRoomSnapshot, buildStandardTable, findByRole } from './fixtures/room-snapshot'
import { ko, renderWithProviders } from './render-helpers'

/**
 * 역할별 렌더링 검증 (TODO.md "역할별 렌더링 검증"): 같은 방을 방장·딜러·플레이어·관전자가
 * 각각 볼 때, 판 진행 중 화면이 비지 않는지 확인한다. `room-client.tsx`는 그 자체로 렌더링하기
 * 무거운 통합 컴포넌트라(useRoomSync 등) 이 파일의 대상이 아니다 — 대신 room-client.tsx가
 * "모바일 하단 바"를 무엇으로 채우는지 결정하는 게이팅 로직(canBet/isDealer/showGostopWait,
 * room-client.tsx:202-206, 360-379)을 그대로 재현해서, 실제로 마운트되는 컴포넌트
 * (ActionBar + dealerSlot=DealerQuickBar, 또는 GostopWaitPanel)만 골라 렌더링한다.
 *
 * Server Action을 부르는 컴포넌트는 DB에 붙으면 안 되므로 액션 모듈을 전부 mock한다 —
 * 이 파일은 클릭을 시뮬레이션하지 않지만(정적 렌더링만 검증), 'use server' 모듈은 import되는
 * 순간 실제 DB 클라이언트를 끌고 오므로 mock 없이 그냥 두면 안 된다(과제 지시사항).
 */
vi.mock('@/features/betting/actions', () => ({
  placeBet: vi.fn(),
  approveBet: vi.fn(),
  rejectBet: vi.fn(),
  revertBet: vi.fn(),
}))
vi.mock('@/features/game/actions', () => ({
  refreshRoom: vi.fn(),
  closeRoom: vi.fn(),
}))
vi.mock('@/features/game/round-actions', () => ({
  startRound: vi.fn(),
  endRound: vi.fn(),
  voidRound: vi.fn(),
}))

afterEach(() => cleanup())

const noopRunAction: RunAction = async () => true

const GAME_TYPES: readonly RoomGameType[] = ['seotda', 'gostop', 'poker']
const ROLES: readonly MemberRole[] = ['host', 'dealer', 'player', 'observer']

/** room-client.tsx:202-206의 게이팅 조건을 그대로 재현한다 — 대상 밖(room-client.tsx) 로직을
 * 다시 구현한 것이므로, 원본이 바뀌면 이 함수도 같이 바뀌어야 한다는 점을 알아두는게 좋다. */
function gatesFor(gameType: RoomGameType, role: MemberRole) {
  const isBettingGame = gameType !== 'gostop'
  const isDealer = role === 'host' || role === 'dealer'
  const canBet = role !== 'observer' && isBettingGame
  const showGostopWait = !isBettingGame && !isDealer
  // 베팅 게임 관전자 전용 표면. 이 조합은 예전에 아무것도 마운트되지 않아 화면이 비었고,
  // 이 테스트가 그 사실을 드러내서 room-client.tsx에 ObserverStatusPanel이 붙었다.
  const showObserverStatus = isBettingGame && role === 'observer'
  return { canBet, isDealer, showGostopWait, showObserverStatus }
}

function renderPrimarySurface(gameType: RoomGameType, role: MemberRole) {
  const members = buildStandardTable()
  const self = findByRole(members, role)
  const snapshot = buildRoomSnapshot({ gameType, members })
  const { canBet, isDealer, showGostopWait, showObserverStatus } = gatesFor(gameType, role)

  if (canBet || isDealer) {
    return renderWithProviders(
      <ActionBar
        snapshot={snapshot}
        self={self}
        runAction={noopRunAction}
        showBetting={canBet}
        dealerSlot={
          isDealer ? (
            <DealerQuickBar
              snapshot={snapshot}
              pendingActions={[]}
              selfId={self.userId}
              runAction={noopRunAction}
            />
          ) : null
        }
      />,
    )
  }
  if (showGostopWait) {
    return renderWithProviders(<GostopWaitPanel hasRound={Boolean(snapshot.currentRound)} />)
  }
  if (showObserverStatus) {
    return renderWithProviders(<ObserverStatusPanel snapshot={snapshot} />)
  }
  return null
}

/** 버튼(행동 가능) 또는 의미 있는 텍스트(상태 안내)가 하나도 없으면 "빈 화면"으로 본다. */
function assertNotEmptyScreen(container: HTMLElement) {
  const buttons = within(container).queryAllByRole('button')
  const text = container.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  expect(
    buttons.length > 0 || text.length > 0,
    `화면에 버튼도 안내 문구도 없다 (텍스트: "${text}")`,
  ).toBe(true)
}

describe('역할별 렌더링 검증 — 게임 종류 × 역할', () => {
  for (const gameType of GAME_TYPES) {
    for (const role of ROLES) {
      const { canBet, isDealer, showGostopWait, showObserverStatus } = gatesFor(gameType, role)
      const mounts = canBet || isDealer || showGostopWait || showObserverStatus
      const label = `${gameType} × ${role}`

      // 이제 모든 게임×역할 조합에 표면이 하나씩 배정된다. 마운트되는 게 없는 조합이
      // 다시 생기면 그건 회귀다 — skip으로 넘기지 않고 실패로 드러낸다.
      it(`${label}: 판 진행 중 마운트되는 표면이 있다`, () => {
        expect(mounts, `${label}에 아무 표면도 배정되지 않았다`).toBe(true)
      })

      it(`${label}: 판 진행 중 화면에 행동 가능한 것 또는 상태 안내가 있다`, () => {
        const rendered = renderPrimarySurface(gameType, role)
        expect(rendered).not.toBeNull()
        assertNotEmptyScreen(rendered!.container)
      })
    }
  }
})

describe('역할별 렌더링 검증 — 구체적 내용', () => {
  it('섯다: 플레이어는 베팅 버튼만 보이고 딜러 컨트롤은 없다', () => {
    renderPrimarySurface('seotda', 'player')
    expect(screen.getByText(ko.bet.seotda.raise)).toBeTruthy()
    expect(screen.getByText(ko.bet.seotda.fold)).toBeTruthy()
    expect(screen.queryByText(ko.dealer.endRound)).toBeNull()
  })

  it('포커: 딜러는 베팅 버튼과 딜러 컨트롤을 함께 본다', () => {
    renderPrimarySurface('poker', 'dealer')
    expect(screen.getByText(ko.bet.poker.raise)).toBeTruthy()
    // "🏁 판 종료"처럼 이모지와 같은 텍스트 노드에 있어 정확히 일치하지 않는다 — exact:false로 부분 일치.
    expect(screen.getByText(ko.dealer.endRound, { exact: false })).toBeTruthy()
    expect(screen.getByText(ko.dealer.voidRound)).toBeTruthy()
  })

  it('고스톱: 방장은 딜러 컨트롤만 보이고 베팅 버튼은 없다', () => {
    renderPrimarySurface('gostop', 'host')
    expect(screen.getByText(ko.dealer.endRound, { exact: false })).toBeTruthy()
    expect(screen.queryByText(ko.bet.seotda.raise)).toBeNull()
    expect(screen.queryByText(ko.bet.seotda.fold)).toBeNull()
  })

  it('고스톱: 플레이어·관전자는 GostopWaitPanel의 안내 문장을 본다', () => {
    renderPrimarySurface('gostop', 'player')
    expect(screen.getByText(ko.room.gostopWaitTitle)).toBeTruthy()
    expect(screen.getByText(ko.room.gostopWaitHint)).toBeTruthy()

    cleanup()
    renderPrimarySurface('gostop', 'observer')
    expect(screen.getByText(ko.room.gostopWaitTitle)).toBeTruthy()
  })
})
