import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActionBar } from '@/features/game/components/action-bar'
import type { RunAction } from '@/features/game/components/shared'
import type { BetActionView, MemberView, RoomSnapshot } from '@/features/game/types'
import { buildBetAction, buildMember, buildRoomSnapshot } from './fixtures/room-snapshot'
import { ko, renderWithProviders } from './render-helpers'

/**
 * 액션바가 실제 판에서 사람 손을 막는 지점 검증.
 *
 * `'use server'` 모듈은 import되는 순간 DB 클라이언트를 끌고 오므로 전부 mock한다
 * (`game-role-rendering.test.tsx`와 같은 이유). 여기서는 버튼을 누르지 않고 잠김 여부만 본다 —
 * 잠긴 버튼은 `Button`이 토스트 사유를 붙일 때 `disabled` 대신 `aria-disabled`로 표시한다.
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

afterEach(cleanup)

const noopRunAction: RunAction = async () => true

function isBlocked(button: HTMLElement): boolean {
  return button.hasAttribute('disabled') || button.getAttribute('aria-disabled') === 'true'
}

function buttonWithExactText(text: string): HTMLElement {
  const match = screen
    .getAllByRole('button')
    .find((button) => button.textContent?.trim() === text)
  if (!match) throw new Error(`버튼을 찾지 못했다: ${text}`)
  return match
}

function snapshotWith({
  members,
  actions,
  participantUserIds,
}: {
  members: readonly MemberView[]
  actions: readonly BetActionView[]
  participantUserIds: readonly string[]
}): RoomSnapshot {
  const base = buildRoomSnapshot({ gameType: 'seotda', members, actions })
  return {
    ...base,
    currentRound: { ...base.currentRound!, participantUserIds },
  }
}

describe('ActionBar — 판 도중 입장한 사람이 차례를 가로채지 않는다', () => {
  // 판은 seat 0~2로 시작했고, late-1은 그 뒤에 들어와 seat 3을 받았다. 서버는 late-1을
  // `round_participants`에 넣지 않으므로 좌석 순환에서 제외한다.
  const members = [
    buildMember({ userId: 'host-1', role: 'host', seatNo: 0 }),
    buildMember({ userId: 'dealer-1', role: 'dealer', seatNo: 1 }),
    buildMember({ userId: 'player-1', role: 'player', seatNo: 2 }),
    buildMember({ userId: 'late-1', role: 'player', seatNo: 3 }),
  ]
  const roundParticipants = ['host-1', 'dealer-1', 'player-1']
  // 마지막 좌석(player-1)이 방금 행동했다 — 다음은 순환해서 host-1이어야 한다.
  const actions = [
    buildBetAction({ userId: 'host-1', action: 'raise', seq: 1, amount: 300 }),
    buildBetAction({ userId: 'dealer-1', action: 'fold', seq: 2 }),
    buildBetAction({ userId: 'player-1', action: 'call', seq: 3, amount: 300 }),
  ]

  it('진짜 차례인 사람의 다이 버튼이 잠기지 않는다', () => {
    const snapshot = snapshotWith({ members, actions, participantUserIds: roundParticipants })

    renderWithProviders(
      <ActionBar
        snapshot={snapshot}
        self={members[0]!}
        runAction={noopRunAction}
      />,
    )

    expect(isBlocked(buttonWithExactText(ko.bet.seotda.fold))).toBe(false)
  })

  it('판 도중 입장한 사람은 자기 차례로 착각하지 않는다', () => {
    const snapshot = snapshotWith({ members, actions, participantUserIds: roundParticipants })

    renderWithProviders(
      <ActionBar snapshot={snapshot} self={members[3]!} runAction={noopRunAction} />,
    )

    expect(isBlocked(buttonWithExactText(ko.bet.seotda.fold))).toBe(true)
  })
})

describe('ActionBar — 삥보다 잔액이 적어도 올인은 누를 수 있다', () => {
  it('최소 레이즈 하한이 올인을 막지 않는다', () => {
    // 픽스처 방의 삥(baseBet)은 100인데 이 사람 잔액은 50뿐이다. 아직 아무도 안 걸어서
    // 최소 레이즈 = 100 > 잔액이라, 예전 조건(`raiseAmount < minRaise`)은 올인까지 잠갔다.
    const members = [
      buildMember({ userId: 'short-1', role: 'host', seatNo: 0, balance: 50 }),
      buildMember({ userId: 'deep-1', role: 'player', seatNo: 1, balance: 10_000 }),
    ]
    const snapshot = snapshotWith({
      members,
      actions: [],
      participantUserIds: ['short-1', 'deep-1'],
    })

    renderWithProviders(
      <ActionBar snapshot={snapshot} self={members[0]!} runAction={noopRunAction} />,
    )

    fireEvent.click(buttonWithExactText(ko.bet.seotda.raise))

    // 확인 버튼 라벨은 `confirmAction`('{label}')이라 올인 프리셋과 글자가 같다 —
    // 프리셋 버튼은 금액 span까지 품고 있어 정확 일치로 갈린다.
    expect(isBlocked(buttonWithExactText(ko.bet.seotda.allin))).toBe(false)
  })
})

describe('ActionBar — 콜 금액 표시', () => {
  it('잔액이 콜에 못 미쳐도 화면에는 실제 콜 금액을 보여준다', () => {
    const members = [
      buildMember({ userId: 'short-1', role: 'host', seatNo: 0, balance: 300 }),
      buildMember({ userId: 'deep-1', role: 'player', seatNo: 1, balance: 10_000 }),
    ]
    const snapshot = snapshotWith({
      members,
      actions: [buildBetAction({ userId: 'deep-1', action: 'raise', seq: 1, amount: 5_000 })],
      participantUserIds: ['short-1', 'deep-1'],
    })

    renderWithProviders(
      <ActionBar snapshot={snapshot} self={members[0]!} runAction={noopRunAction} />,
    )

    const callButton = screen
      .getAllByRole('button')
      .find((button) => button.textContent?.startsWith(ko.bet.seotda.call))
    expect(callButton?.textContent).toContain('5,000')
    // 콜은 못 하지만(잔액 300) 금액은 300이 아니라 5,000으로 읽혀야 한다.
    expect(isBlocked(callButton!)).toBe(true)
  })
})
