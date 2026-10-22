import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/jokbo-advisor/components/vision-capture', () => ({
  VisionCapture: () => null,
}))

import { AdvisorBoard } from '@/features/jokbo-advisor/components/advisor-board'
import { ko, renderWithProviders } from './render-helpers'

afterEach(cleanup)

describe('AdvisorBoard GoStop', () => {
  it('opens the score after the third selected card', () => {
    renderWithProviders(<AdvisorBoard visionEnabled={false} initialTab="gostop" />)

    const cardButtons = screen.getAllByRole('button', { name: /선택$/ })
    cardButtons.slice(0, 3).forEach((button) => fireEvent.click(button))

    expect(
      screen.getByRole('radio', { name: ko.advisor.resultTab }).getAttribute('aria-checked'),
    ).toBe('true')
  })
})
