import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomHeader } from '@/features/game/components/room-header'
import { buildRoomSnapshot, buildStandardTable } from './fixtures/room-snapshot'
import { ko, renderWithProviders } from './render-helpers'

/**
 * 방 헤더의 세로 화면 규약.
 *
 * 아이콘 5개(🔊 🧾 🔮 📺 ⚙️)는 48px씩이라 272px, 360px 화면에서는 제목 줄과 같은 줄에
 * 못 들어가 헤더가 두 줄로 접혔고 라벨이 없어 무슨 기능인지도 알 수 없었다. 세로에서는
 * 음소거와 ⋯ 두 개만 남기고 나머지를 이름 붙은 메뉴 시트로 내린다.
 */
afterEach(cleanup)

function setViewport(isDesktop: boolean) {
  // `useIsDesktop`은 `useSyncExternalStore` + `matchMedia`를 쓴다. jsdom 은 matchMedia 가
  // 없으므로 폭에 따라 답하는 스텁을 심는다.
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: isDesktop && query.includes('1024px'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  )
}

function renderHeader({ isHost = true }: { isHost?: boolean } = {}) {
  const snapshot = buildRoomSnapshot({ gameType: 'seotda', members: buildStandardTable() })
  const onOpenAdvisor = vi.fn()
  renderWithProviders(
    <RoomHeader
      snapshot={snapshot}
      isHost={isHost}
      muted={false}
      onToggleMute={() => {}}
      onOpenAdvisor={onOpenAdvisor}
    />,
  )
  return { snapshot, onOpenAdvisor }
}

beforeEach(() => {
  setViewport(false)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RoomHeader — 세로 화면', () => {
  it('제어 버튼을 음소거와 메뉴 두 개로 줄인다', () => {
    renderHeader()

    expect(screen.getByRole('button', { name: ko.room.soundOffAria })).toBeTruthy()
    expect(screen.getByRole('button', { name: ko.room.menuAria })).toBeTruthy()

    // 나머지 넷은 헤더에 직접 놓이지 않는다 — 메뉴를 열기 전에는 없어야 한다.
    expect(screen.queryByRole('link', { name: ko.room.resultAria })).toBeNull()
    expect(screen.queryByRole('button', { name: ko.room.advisorAria })).toBeNull()
    expect(screen.queryByRole('link', { name: ko.room.monitorAria })).toBeNull()
    expect(screen.queryByRole('link', { name: ko.room.settingsAria })).toBeNull()
  })

  it('메뉴를 열면 각 항목이 이름과 설명을 달고 나온다', () => {
    renderHeader()
    fireEvent.click(screen.getByRole('button', { name: ko.room.menuAria }))

    const menu = screen.getByRole('dialog', { name: ko.room.menuTitle })
    expect(within(menu).getByText(ko.room.resultAria)).toBeTruthy()
    expect(within(menu).getByText(ko.room.resultMenuHint)).toBeTruthy()
    expect(within(menu).getByText(ko.room.advisorAria)).toBeTruthy()
    expect(within(menu).getByText(ko.room.monitorTitle)).toBeTruthy()
    expect(within(menu).getByText(ko.room.settingsTitle)).toBeTruthy()
  })

  it('판독기 항목은 방을 떠나지 않고 시트를 연다', () => {
    const { onOpenAdvisor } = renderHeader()
    fireEvent.click(screen.getByRole('button', { name: ko.room.menuAria }))

    const menu = screen.getByRole('dialog', { name: ko.room.menuTitle })
    fireEvent.click(within(menu).getByText(ko.room.advisorAria))
    expect(onOpenAdvisor).toHaveBeenCalledTimes(1)
  })

  it('방장이 아니면 메뉴에 방 옵션이 없다', () => {
    renderHeader({ isHost: false })
    fireEvent.click(screen.getByRole('button', { name: ko.room.menuAria }))

    const menu = screen.getByRole('dialog', { name: ko.room.menuTitle })
    expect(within(menu).queryByText(ko.room.settingsTitle)).toBeNull()
    // 나머지 셋은 그대로 있다.
    expect(within(menu).getByText(ko.room.resultAria)).toBeTruthy()
  })

  it('상태 뱃지는 제목 줄에 있고 메타는 한 줄로 잘린다', () => {
    renderHeader()
    // 뱃지가 제목과 같은 줄이 아니면 폰 폭에서 헤더가 3단이 된다.
    const heading = screen.getByRole('heading', { level: 1 })
    const titleRow = heading.parentElement
    expect(titleRow).toBeTruthy()
    expect(within(titleRow as HTMLElement).getByText(/진행 중|대기/)).toBeTruthy()
  })
})

describe('RoomHeader — 데스크톱', () => {
  it('폭이 넉넉하면 다섯 개를 그대로 펼친다', () => {
    setViewport(true)
    renderHeader()

    expect(screen.getByRole('button', { name: ko.room.soundOffAria })).toBeTruthy()
    expect(screen.getByRole('link', { name: ko.room.resultAria })).toBeTruthy()
    expect(screen.getByRole('button', { name: ko.room.advisorAria })).toBeTruthy()
    expect(screen.getByRole('link', { name: ko.room.monitorAria })).toBeTruthy()
    expect(screen.getByRole('link', { name: ko.room.settingsAria })).toBeTruthy()
    expect(screen.queryByRole('button', { name: ko.room.menuAria })).toBeNull()
  })
})
