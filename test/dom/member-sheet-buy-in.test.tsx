import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addBuyIn } from '@/features/budget/actions'
import { BuyInSection } from '@/features/game/components/member-sheet-buy-in'
import type { RunAction } from '@/features/game/components/shared'
import { ko, renderWithProviders } from './render-helpers'

/**
 * 바이인 재전송 흡수의 **클라이언트 쪽 절반**을 검증한다.
 *
 * 서버는 `requestId`를 `buy_ins.id`로 그대로 써서 같은 id의 두 번째 요청을 흡수한다.
 * 그래서 화면이 id를 언제 갈아 끼우는지가 곧 동작이 된다:
 * - 실패 뒤 재시도는 **같은 id**여야 한다. 아니면 흡수할 것이 없어 두 벌이 확정된다.
 * - 성공 뒤 새 지급은 **다른 id**여야 한다. 아니면 딜러가 일부러 한 번 더 준 지급이
 *   서버에서 기존 바이인으로 취급돼 칩은 그대로인데 화면만 성공이라고 말한다
 *   (`wallet/components/credit-admin.tsx`가 먼저 밟은 함정이다).
 *
 * 서버 액션 모듈은 다른 DOM 테스트와 같은 이유로 mock한다 — DB에 붙으면 안 된다.
 */
vi.mock('@/features/budget/actions', () => ({ addBuyIn: vi.fn(), undoLastBuyIn: vi.fn() }))

const addBuyInMock = vi.mocked(addBuyIn)

const ROOM_ID = '11111111-1111-4111-8111-111111111111'
const MEMBER_ID = '22222222-2222-4222-8222-222222222222'

const runAction: RunAction = async (action) => (await action()).success

function renderSection() {
  return renderWithProviders(
    <BuyInSection
      roomId={ROOM_ID}
      memberId={MEMBER_ID}
      memberBuyInTotal={1000}
      startingChips={1000}
      baseBet={100}
      isPending={false}
      run={(task) => {
        void task()
      }}
      runAction={runAction}
      onUndoRequest={() => {}}
    />,
  )
}

/** 지급 버튼 이름은 `💰 {금액} 지급` — 되돌리기 버튼(`마지막 지급 취소`)과 접미사로 가른다. */
async function clickGrant() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /지급$/ }))
  })
}

function requestIdOfCall(index: number): string {
  const call = addBuyInMock.mock.calls[index]
  if (!call) throw new Error(`addBuyIn call #${index} was never made`)
  return call[0].requestId
}

beforeEach(() => {
  addBuyInMock.mockReset()
})
afterEach(() => cleanup())

describe('BuyInSection — 요청 id 수명', () => {
  it('지급은 uuid 요청 id와 함께 보낸다', async () => {
    addBuyInMock.mockResolvedValue({
      success: true,
      data: { userId: MEMBER_ID, amount: 1000, balance: 2000 },
    })
    renderSection()

    await clickGrant()

    expect(addBuyInMock).toHaveBeenCalledTimes(1)
    expect(addBuyInMock.mock.calls[0]?.[0]).toMatchObject({
      roomId: ROOM_ID,
      targetUserId: MEMBER_ID,
      amount: 1000,
    })
    expect(requestIdOfCall(0)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
  })

  it('실패한 지급을 다시 누르면 같은 요청 id로 재시도한다 (중복 확정 방지)', async () => {
    addBuyInMock.mockResolvedValue({ success: false, error: 'errors.addBuyInFailed' })
    renderSection()

    await clickGrant()
    await clickGrant()

    expect(addBuyInMock).toHaveBeenCalledTimes(2)
    expect(requestIdOfCall(1)).toBe(requestIdOfCall(0))
  })

  it('성공한 뒤 같은 금액을 한 번 더 지급하면 새 요청 id를 쓴다 (조용한 no-op 방지)', async () => {
    addBuyInMock.mockResolvedValue({
      success: true,
      data: { userId: MEMBER_ID, amount: 1000, balance: 2000 },
    })
    renderSection()

    await clickGrant()
    await clickGrant()

    expect(addBuyInMock).toHaveBeenCalledTimes(2)
    expect(requestIdOfCall(1)).not.toBe(requestIdOfCall(0))
  })

  it('금액을 바꾸면 확정 전이라도 새 요청 id를 쓴다', async () => {
    addBuyInMock.mockResolvedValue({ success: false, error: 'errors.addBuyInFailed' })
    renderSection()

    await clickGrant()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(ko.memberSheet.presetHalf) }))
    })
    await clickGrant()

    expect(addBuyInMock.mock.calls[1]?.[0].amount).toBe(500)
    expect(requestIdOfCall(1)).not.toBe(requestIdOfCall(0))
  })
})
