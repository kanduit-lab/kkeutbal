import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Stepper } from '@/components/ui'
import { ko, renderWithProviders } from './render-helpers'

/**
 * `Stepper`(src/components/ui/stepper.tsx)의 값 조작 경로 세 가지를 검증한다.
 *
 * 예전 스테퍼는 `step` 기본값이 1이고 조작 수단이 +/− 뿐이라, 삥 단위를 1에서 10,000으로
 * 올리려면 버튼을 만 번 누르거나 손가락을 몇 분간 올려놔야 했다. 그래서 세 가지가 붙었다 —
 * 눈금(step), 누르고 있을 때의 가속, 숫자를 눌러 여는 직접 입력 다이얼로그.
 */

afterEach(cleanup)

function Harness({
  step = 10,
  min = 1,
  max = 100_000,
}: {
  step?: number
  min?: number
  max?: number
}) {
  const [value, setValue] = useState(100)
  return (
    <Stepper
      value={value}
      onChange={setValue}
      min={min}
      max={max}
      step={step}
      ariaLabel="삥 단위"
      decreaseLabel={ko.ui.decrease}
      increaseLabel={ko.ui.increase}
    />
  )
}

/** 스테퍼가 지금 보여주는 값 */
function shownValue(): number {
  const button = screen.getByRole('button', { name: `삥 단위 · ${ko.ui.editValue}` })
  return Number(button.textContent!.replace(/[^0-9]/g, ''))
}

const plus = () => screen.getByRole('button', { name: ko.ui.increase })
const minus = () => screen.getByRole('button', { name: ko.ui.decrease })
const applyButton = () => screen.getByRole('button', { name: ko.ui.apply })

function openEditor() {
  fireEvent.click(screen.getByRole('button', { name: `삥 단위 · ${ko.ui.editValue}` }))
  // 다이얼로그 안으로 좁혀서 찾는다 — 바깥 스테퍼 묶음도 같은 `삥 단위` 이름을 갖는다.
  return within(screen.getByRole('dialog')).getByRole('textbox')
}

function typeAndApply(text: string) {
  fireEvent.change(openEditor(), { target: { value: text } })
  fireEvent.click(applyButton())
}

describe('Stepper — 눈금', () => {
  it('한 번 누르면 1이 아니라 step 만큼 움직인다', () => {
    renderWithProviders(<Harness step={10} />)
    fireEvent.pointerDown(plus(), { button: 0 })
    fireEvent.pointerUp(plus())
    expect(shownValue()).toBe(110)
  })

  it('격자를 벗어난 값에서 눌러도 step 배수로 정렬된다', () => {
    // 137에서 +10 은 147이 아니라 140이어야 한다 — 직접 입력 뒤에도 값이 깔끔하게 유지된다.
    renderWithProviders(<Harness step={10} />)
    typeAndApply('137')
    expect(shownValue()).toBe(137)

    fireEvent.pointerDown(plus(), { button: 0 })
    fireEvent.pointerUp(plus())
    expect(shownValue()).toBe(140)

    fireEvent.pointerDown(minus(), { button: 0 })
    fireEvent.pointerUp(minus())
    expect(shownValue()).toBe(130)
  })

  it('min 아래로는 내려가지 않고 그 버튼이 비활성이 된다', () => {
    renderWithProviders(<Harness step={10} min={100} />)
    expect((minus() as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('Stepper — 누르고 있을 때 가속', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('오래 누를수록 같은 시간에 더 많이 오른다', () => {
    renderWithProviders(<Harness step={10} />)

    fireEvent.pointerDown(plus(), { button: 0 })
    // 누른 즉시 한 칸
    expect(shownValue()).toBe(110)

    // 첫 구간(배수 1): 홀드 지연 400ms + 반복 10회
    act(() => void vi.advanceTimersByTime(400 + 10 * 90))
    const afterSlow = shownValue()
    const slowGain = afterSlow - 110

    // 같은 반복 횟수를 더 눌러 두면 가속이 붙어 증가폭이 커진다
    act(() => void vi.advanceTimersByTime(10 * 90))
    const fastGain = shownValue() - afterSlow

    expect(slowGain).toBeGreaterThan(0)
    expect(fastGain).toBeGreaterThan(slowGain)

    fireEvent.pointerUp(plus())
  })

  it('손을 떼면 반복이 멈춘다', () => {
    renderWithProviders(<Harness step={10} />)
    fireEvent.pointerDown(plus(), { button: 0 })
    fireEvent.pointerUp(plus())
    act(() => void vi.advanceTimersByTime(5_000))
    expect(shownValue()).toBe(110)
  })

  it('max에 닿으면 눌러 두어도 넘지 않는다', () => {
    renderWithProviders(<Harness step={10} max={200} />)
    fireEvent.pointerDown(plus(), { button: 0 })
    act(() => void vi.advanceTimersByTime(5_000))
    fireEvent.pointerUp(plus())
    expect(shownValue()).toBe(200)
  })
})

describe('Stepper — 직접 입력 다이얼로그', () => {
  it('숫자를 누르면 다이얼로그가 열리고 입력한 값이 반영된다', () => {
    renderWithProviders(<Harness step={10} />)
    typeAndApply('10000')
    expect(shownValue()).toBe(10_000)
  })

  it('범위를 벗어난 값은 적용 버튼이 막고 안내를 보여준다', () => {
    renderWithProviders(<Harness step={10} max={1_000} />)
    fireEvent.change(openEditor(), { target: { value: '999999' } })

    expect((applyButton() as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/1 ~ 1,000 사이의 숫자/)).toBeTruthy()
  })

  it('취소하면 값이 그대로다', () => {
    renderWithProviders(<Harness step={10} />)
    fireEvent.change(openEditor(), { target: { value: '777' } })
    fireEvent.click(screen.getByRole('button', { name: ko.ui.cancel }))
    expect(shownValue()).toBe(100)
  })

  it('콤마가 섞인 입력도 받아준다', () => {
    renderWithProviders(<Harness step={10} />)
    typeAndApply('12,500')
    expect(shownValue()).toBe(12_500)
  })
})
