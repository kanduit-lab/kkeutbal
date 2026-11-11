import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HandChoicePanel } from '@/features/game/components/hand-choice-panel'
import type { RunAction } from '@/features/game/components/shared'
import { buildMember, buildRoomSnapshot } from './fixtures/room-snapshot'
import { ko, renderWithProviders } from './render-helpers'

/** `'use server'` 모듈은 import되는 순간 DB·인증 클라이언트를 끌고 온다 — 서버 의존만 mock한다. */
vi.mock('@/features/auth/session', () => ({ currentUserId: vi.fn(async () => 'me') }))
vi.mock('@/features/betting/bet-queries', () => ({ memberInfo: vi.fn(async () => null) }))
vi.mock('@/features/game/action-helpers', () => ({
  lockRoom: vi.fn(),
  readSeotdaCards: vi.fn(async () => []),
}))
vi.mock('@/features/game/round-finalize', () => ({ autoSettleRoundIfComplete: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: {}, schema: {} }))
vi.mock('@/lib/env', () => ({
  serverEnv: () => ({
    AUTH_SECRET: 'test-secret-test-secret-test-secret',
    DATABASE_SESSION_URL: 'postgres://test',
  }),
}))
vi.mock('@/features/fairness/seed-crypto', () => ({
  deriveSeed: vi.fn(() => 'seed'),
  sealSeed: vi.fn((value: string) => value),
  openSeed: vi.fn((value: string) => value),
}))
vi.mock('@/features/fairness/fairness-actions', () => ({
  getMyVerifiedSeotdaHand: vi.fn(async () => ({
    success: true as const,
    data: {
      cards: ['08-gwang', '01-gwang', '07-yeol'].map((id) => ({ id })),
      chosenCardIds: null,
    },
  })),
}))
vi.mock('@/features/game/hand-choice-actions', () => ({
  submitHandChoice: vi.fn(async () => ({})),
  settleDueHandChoices: vi.fn(async () => ({})),
}))

const noopRunAction: RunAction = async () => true

function choosingSnapshot() {
  const base = buildRoomSnapshot({
    gameType: 'seotda',
    members: [buildMember({ userId: 'me', role: 'player' })],
  })
  const round = base.currentRound
  if (!round) throw new Error('fixture missing round')
  return {
    ...base,
    currentRound: {
      ...round,
      street: 2,
      chooseDeadline: new Date(Date.now() + 60_000).toISOString(),
    },
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('HandChoicePanel', () => {
  it('선택지마다 서열과 뒤집히는 관계를 적는다', async () => {
    renderWithProviders(
      <HandChoicePanel snapshot={choosingSnapshot()} selfId="me" runAction={noopRunAction} />,
    )

    // 1광 + 8광은 서열 2위 광땡이지만 암행어사(4·7 열끗)에 잡히는 쌍이다.
    const options = await screen.findAllByRole('radio')
    expect(options).toHaveLength(3)
    for (const option of options) {
      expect(option.textContent).toMatch(/서열 \d+위/)
    }
    const caught = options.find((option) =>
      option.textContent?.includes(ko.fairness.chooseCaughtBy.replace('{trait}', '암행어사')),
    )
    expect(caught).toBeDefined()
    expect(caught?.textContent).toContain('18광땡')
    expect(caught?.textContent).toContain(ko.fairness.chooseBest)
  })

  it('선택을 바꾸면 라디오 상태가 따라간다', async () => {
    renderWithProviders(
      <HandChoicePanel snapshot={choosingSnapshot()} selfId="me" runAction={noopRunAction} />,
    )

    const options = await screen.findAllByRole('radio')
    expect(options[0]?.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(options[1] as HTMLElement)
    expect(options[1]?.getAttribute('aria-checked')).toBe('true')
    expect(options[0]?.getAttribute('aria-checked')).toBe('false')
  })
})
