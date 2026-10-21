import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TurnRailBar } from '@/features/game/components/turn-rail-bar'
import { PotCore } from '@/features/game/components/pot-core'
import { SelfBar } from '@/features/game/components/self-bar'
import { MemberListSheet } from '@/features/game/components/member-list-sheet'
import { turnRail } from '@/features/game/turn-rail'
import { buildBetAction, buildMember, buildStandardTable } from './fixtures/room-snapshot'
import { ko, renderWithProviders } from './render-helpers'

/**
 * 세로 모바일 베팅 화면의 표면 검증.
 *
 * `room-client.tsx`는 `useRoomSync` 때문에 통째로 렌더하기 무겁다(같은 이유로
 * `game-role-rendering.test.tsx`도 대상에서 뺐다). 대신 좌석 링을 대체한 네 컴포넌트를
 * 직접 렌더해서, 좌석 링이 사라지면서 잃을 뻔한 정보(누구 차례인가 · 팟이 얼마인가 ·
 * 내 잔액은 얼마인가 · 다른 참가자에게 어떻게 닿는가)가 화면에 남아 있는지 확인한다.
 */
afterEach(cleanup)

const PARTICIPANTS = ['host-1', 'dealer-1', 'player-1'] as const

function railFor(actions: Parameters<typeof turnRail>[1], roundActive = true) {
  return turnRail(PARTICIPANTS, actions, { roundActive })
}

describe('TurnRailBar — 노선도', () => {
  it('직전 액션·지금 차례·다음 차례를 한 줄에 세운다', () => {
    const actions = [buildBetAction({ userId: 'host-1', action: 'raise', seq: 1, amount: 300 })]

    renderWithProviders(
      <TurnRailBar
        rail={railFor(actions)}
        members={buildStandardTable()}
        selfId="player-1"
        gameType="seotda"
        historyCount={actions.length}
        onOpenHistory={vi.fn()}
      />,
    )

    // 직전 액션: host-1 의 레이즈 300. 라벨은 사전값을 그대로 쓴다 — shared.ts 의 하드코딩
    // 폴백('올려')과 사전('레이즈')이 다르므로 리터럴로 적으면 어느 쪽을 검증하는지 흐려진다.
    expect(screen.getByText(ko.bet.seotda.raise)).toBeTruthy()
    expect(screen.getByText('300')).toBeTruthy()
    // host-1 다음은 dealer-1(지금), 그 다음은 player-1(=나).
    expect(screen.getByText('dealer-1')).toBeTruthy()
  })

  it('내 차례면 이름 대신 내 차례라고 알린다', () => {
    const actions = [buildBetAction({ userId: 'host-1', action: 'call', seq: 1, amount: 100 })]

    renderWithProviders(
      <TurnRailBar
        rail={railFor(actions)}
        members={buildStandardTable()}
        selfId="dealer-1"
        gameType="seotda"
        historyCount={1}
        onOpenHistory={vi.fn()}
      />,
    )

    expect(screen.getByText(ko.rail.yourTurn)).toBeTruthy()
  })

  it('포커 방에서는 포커 라벨을 쓴다 — 섯다 라벨이 새면 안 된다', () => {
    const actions = [buildBetAction({ userId: 'host-1', action: 'fold', seq: 1 })]

    renderWithProviders(
      <TurnRailBar
        rail={railFor(actions)}
        members={buildStandardTable()}
        selfId="player-1"
        gameType="poker"
        historyCount={1}
        onOpenHistory={vi.fn()}
      />,
    )

    expect(screen.getByText(ko.bet.poker.fold)).toBeTruthy()
    expect(screen.queryByText(ko.bet.seotda.fold)).toBeFalsy()
  })

  it('판이 없으면 대기 상태를 알린다', () => {
    renderWithProviders(
      <TurnRailBar
        rail={railFor([], false)}
        members={buildStandardTable()}
        selfId="player-1"
        gameType="seotda"
        historyCount={0}
        onOpenHistory={vi.fn()}
      />,
    )

    // 눈에 보이는 문구와 sr-only 라이브 리전이 같은 말을 하므로 두 번 잡힌다 — 의도된 중복.
    expect(screen.getAllByText(ko.rail.roundIdle).length).toBeGreaterThan(0)
  })

  it('승인 대기 베팅은 확정처럼 보이지 않게 대기 표시를 단다', () => {
    const actions = [
      buildBetAction({ userId: 'host-1', action: 'raise', seq: 1, amount: 200, status: 'pending' }),
    ]

    renderWithProviders(
      <TurnRailBar
        rail={railFor(actions)}
        members={buildStandardTable()}
        selfId="player-1"
        gameType="seotda"
        historyCount={1}
        onOpenHistory={vi.fn()}
      />,
    )

    expect(screen.getByText(ko.rail.pending)).toBeTruthy()
  })

  it('기록 버튼이 접근 가능한 이름을 갖고 눌리면 열기를 요청한다', () => {
    const onOpenHistory = vi.fn()

    renderWithProviders(
      <TurnRailBar
        rail={railFor([])}
        members={buildStandardTable()}
        selfId="player-1"
        gameType="seotda"
        historyCount={3}
        onOpenHistory={onOpenHistory}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: ko.betHistory.openAria }))
    expect(onOpenHistory).toHaveBeenCalledOnce()
  })
})

describe('PotCore — 원형 팟', () => {
  it('팟 금액을 읽을 수 있게 알린다', () => {
    renderWithProviders(<PotCore pot={12_400} pulse={null} roundActive />)

    // 화면 표시와 스크린리더 안내가 같은 값을 말해야 한다.
    expect(screen.getAllByText('12,400').length).toBeGreaterThan(0)
    expect(screen.getByText('팟 12,400')).toBeTruthy()
  })

  it('판이 없으면 대기 상태로 죽인다', () => {
    renderWithProviders(<PotCore pot={0} pulse={null} roundActive={false} />)

    expect(screen.getByText(ko.rail.roundIdle)).toBeTruthy()
  })
})

describe('SelfBar — 내 숫자', () => {
  it('잔액과 손익 부호를 함께 보여준다', () => {
    const self = buildMember({
      userId: 'player-1',
      role: 'player',
      displayName: '영희',
      balance: 12_000,
      buyInTotal: 10_000,
    })

    renderWithProviders(<SelfBar self={self} myBet={500} online />)

    expect(screen.getByText('영희')).toBeTruthy()
    expect(screen.getByText('12,000')).toBeTruthy()
    expect(screen.getByText('+2,000')).toBeTruthy()
  })

  it('손해면 음수 부호를 그대로 쓴다', () => {
    const self = buildMember({
      userId: 'player-1',
      role: 'player',
      balance: 7_000,
      buyInTotal: 10_000,
    })

    renderWithProviders(<SelfBar self={self} myBet={0} online={false} />)

    expect(screen.getByText('-3,000')).toBeTruthy()
  })
})

describe('MemberListSheet — 참가자로 가는 입구', () => {
  it('참가자를 모두 싣고 고르면 그 사람을 넘긴다', () => {
    const onSelect = vi.fn()
    const members = buildStandardTable()

    renderWithProviders(
      <MemberListSheet
        open
        onClose={vi.fn()}
        members={members}
        online={new Set(['host-1'])}
        selfId="player-1"
        actions={[]}
        gameType="seotda"
        onSelect={onSelect}
      />,
    )

    const dialog = screen.getByRole('dialog')
    for (const member of members) {
      expect(within(dialog).getByText(member.displayName)).toBeTruthy()
    }

    fireEvent.click(within(dialog).getByText('dealer-1'))
    expect(onSelect).toHaveBeenCalledWith('dealer-1')
  })
})
