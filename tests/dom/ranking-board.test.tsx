import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RankingBoard, type RankingBoardRow } from '@/features/ranking/components/ranking-board'
import { ko, renderWithProviders } from './render-helpers'

const AREA_H = 72 * 5
const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => AREA_H,
  })
})

afterEach(() => {
  cleanup()
  if (original) Object.defineProperty(HTMLElement.prototype, 'clientHeight', original)
})

const rows: readonly RankingBoardRow[] = Array.from({ length: 6 }, (_, index) => ({
  rank: index + 1,
  userId: `player-${index + 1}`,
  displayName: `플레이어 ${index + 1}`,
  sessions: index + 1,
  wins: index,
  net: 600 - index * 200,
}))

describe('RankingBoard', () => {
  it('fills the measured area and keeps the current user reachable across pages', () => {
    renderWithProviders(<RankingBoard rows={rows} myId="player-6" />)

    expect(screen.getByText('1–5 · 총 6')).not.toBeNull()
    expect(within(screen.getByLabelText(ko.ranking.listAria)).queryByText('플레이어 6')).toBeNull()
    expect(screen.getByLabelText(ko.ranking.myPositionAria)).not.toBeNull()

    fireEvent.click(screen.getByLabelText(ko.common.pager.next))

    expect(screen.getByText('6–6 · 총 6')).not.toBeNull()
    expect(within(screen.getByLabelText(ko.ranking.listAria)).getByText('플레이어 6')).not.toBeNull()
    expect(screen.queryByLabelText(ko.ranking.myPositionAria)).toBeNull()
  })
})
