import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/jokbo-advisor/components/vision-capture', () => ({
  VisionCapture: () => null,
}))

import { AdvisorBoard } from '@/features/jokbo-advisor/components/advisor-board'
import { findCard } from '@/features/hwatu/cards'
import { ko, renderWithProviders } from './render-helpers'

function pick(id: string) {
  const card = findCard(id)
  if (!card) throw new Error(`unknown card ${id}`)
  fireEvent.click(
    screen.getByRole('button', { name: ko.advisor.cardToggleAria.replace('{card}', card.label) }),
  )
}

// 두 장째에서 결과 탭으로 넘어가므로, 더 고르려면 카드 선택 탭으로 돌아와야 한다.
function showPicker() {
  fireEvent.click(screen.getByRole('radio', { name: ko.advisor.pickerTab }))
}

afterEach(cleanup)

describe('AdvisorBoard', () => {
  it('opens the result once the hand is complete', () => {
    renderWithProviders(<AdvisorBoard visionEnabled={false} />)

    const cardButtons = screen.getAllByRole('button', { name: /선택$/ })
    cardButtons.slice(0, 2).forEach((button) => fireEvent.click(button))

    expect(
      screen.getByRole('radio', { name: ko.advisor.resultTab }).getAttribute('aria-checked'),
    ).toBe('true')
  })

  it('reads three cards by their best pair and blocks a fourth', () => {
    renderWithProviders(<AdvisorBoard visionEnabled={false} />)

    // 난초 초단 + 벚꽃 광 = 8끗, 난초 초단 + 공산 광 = 3끗, 벚꽃 광 + 공산 광 = 38광땡
    pick('05-tti')
    pick('03-gwang')
    showPicker()
    pick('08-gwang')

    const pairRows = within(
      screen.getByRole('list', { name: ko.advisor.pairsHeading }),
    ).getAllByRole('listitem')
    expect(pairRows).toHaveLength(3)
    const best = pairRows.filter((row) => row.getAttribute('aria-current') === 'true')
    expect(best).toHaveLength(1)
    expect(best[0]?.textContent).toContain('38광땡')

    showPicker()
    pick('01-gwang')
    expect(
      screen.getByText(ko.advisor.cardSelectionCount.replace('{n}', '3').replace('{max}', '3')),
    ).not.toBeNull()
  })
})
