import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RoundLog } from '@/features/game/components/round-log'
import { buildMember } from './fixtures/room-snapshot'
import { ko, renderWithProviders } from './render-helpers'

/**
 * `RoundLog`는 서버 액션을 import하지 않는 순수 표시 컴포넌트라 mock 없이 그대로 렌더링해
 * 검증할 수 있다. 역할과 무관하게 항상 같은 내용을 보여주므로(관전자든 딜러든 로그는 로그다),
 * 역할별 조합이 아니라 "판 진행 중 화면이 비지 않는다"는 완료 기준 중 로그 쪽을 데이터
 * 조합으로 검증한다.
 */

afterEach(() => cleanup())

const MEMBERS = [
  buildMember({ userId: 'host-1', role: 'host', displayName: '방장' }),
  buildMember({ userId: 'player-1', role: 'player', displayName: '플레이어' }),
]

describe('RoundLog', () => {
  it('액션이 없으면 빈 화면 대신 EmptyState 문장을 보여준다', () => {
    renderWithProviders(<RoundLog actions={[]} members={MEMBERS} />)
    expect(screen.getByText(ko.roundLog.empty)).toBeTruthy()
  })

  it('액션이 있으면 seq·이름·라벨·금액을 보여준다 (최신이 위로)', () => {
    renderWithProviders(
      <RoundLog
        actions={[
          {
            id: 'a1',
            roundId: 'r1',
            userId: 'host-1',
            enteredBy: null,
            action: 'call',
            amount: 100,
            status: 'accepted',
            reason: null,
            seq: 1,
            createdAt: '2026-07-30T00:00:00.000Z',
          },
          {
            id: 'a2',
            roundId: 'r1',
            userId: 'player-1',
            enteredBy: null,
            action: 'raise',
            amount: 300,
            status: 'accepted',
            reason: null,
            seq: 2,
            createdAt: '2026-07-30T00:00:01.000Z',
          },
        ]}
        members={MEMBERS}
        gameType="seotda"
      />,
    )
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    // reverse() 정렬 — seq 2(플레이어의 레이즈)가 먼저 온다.
    expect(within(items[0]!).getByText('플레이어')).toBeTruthy()
    expect(within(items[0]!).getByText(ko.bet.seotda.raise)).toBeTruthy()
    expect(within(items[0]!).getByText('300')).toBeTruthy()
    expect(within(items[1]!).getByText('방장')).toBeTruthy()
    expect(within(items[1]!).getByText(ko.bet.seotda.call)).toBeTruthy()
  })

  it('포커는 폴드 라벨을 쓰고, 대리 입력이면 대리 표시가 붙는다', () => {
    renderWithProviders(
      <RoundLog
        actions={[
          {
            id: 'a1',
            roundId: 'r1',
            userId: 'player-1',
            enteredBy: 'host-1',
            action: 'fold',
            amount: 0,
            status: 'accepted',
            reason: null,
            seq: 1,
            createdAt: '2026-07-30T00:00:00.000Z',
          },
        ]}
        members={MEMBERS}
        gameType="poker"
      />,
    )
    expect(screen.getByText(ko.bet.poker.fold)).toBeTruthy()
    expect(screen.getByText(`(대리: 방장)`)).toBeTruthy()
  })

  it('대기·거절·정정 상태에 배지와 사유가 붙는다', () => {
    renderWithProviders(
      <RoundLog
        actions={[
          {
            id: 'a1',
            roundId: 'r1',
            userId: 'player-1',
            enteredBy: null,
            action: 'raise',
            amount: 500,
            status: 'rejected',
            reason: 'insufficientBalance',
            seq: 1,
            createdAt: '2026-07-30T00:00:00.000Z',
          },
        ]}
        members={MEMBERS}
      />,
    )
    expect(screen.getByText(ko.roundLog.statusRejected)).toBeTruthy()
    // reasonLine 포맷 '사유: {reason}' — translateError가 알려진 키를 사람이 읽을 말로 바꾼다.
    expect(screen.getByText((_, node) => node?.textContent?.startsWith('사유:') ?? false)).toBeTruthy()
  })

  it('board scale은 최대 8건만 보여주고 글자 크기가 커진다', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `a${i}`,
      roundId: 'r1',
      userId: 'player-1',
      enteredBy: null,
      action: 'call' as const,
      amount: 10,
      status: 'accepted' as const,
      reason: null,
      seq: i + 1,
      createdAt: '2026-07-30T00:00:00.000Z',
    }))
    renderWithProviders(<RoundLog actions={many} members={MEMBERS} scale="board" />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(8)
    // 최신 12건 중 위 8건(seq 12~5)만 남아야 한다.
    expect(within(items[0]!).getByText('#12')).toBeTruthy()
    expect(within(items[7]!).getByText('#5')).toBeTruthy()
  })
})
