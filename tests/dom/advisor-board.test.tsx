import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/jokbo-advisor/components/vision-capture', () => ({
  VisionCapture: () => null,
}))

import { AdvisorBoard } from '@/features/jokbo-advisor/components/advisor-board'
import { ko, renderWithProviders } from './render-helpers'

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
})
