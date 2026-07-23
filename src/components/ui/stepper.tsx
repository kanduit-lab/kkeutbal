'use client'

import { clsx } from 'clsx'
import { useCallback, useEffect, useRef } from 'react'

/**
 * 길게 누르면 자동 반복 — 400ms 홀드 후 120ms 간격으로 fire 를 호출한다.
 * fire 가 false 를 돌려주면(경계 도달) 스스로 멈춘다 — 경계에서 버튼이 disabled 로
 * 바뀌면 pointerup 이 그 버튼에 전달되지 않기 때문. 언마운트 시에도 타이머를 정리한다.
 */
function useHoldRepeat(fire: () => boolean) {
  const fireRef = useRef(fire)
  useEffect(() => {
    fireRef.current = fire
  }, [fire])

  const timersRef = useRef<{
    hold: ReturnType<typeof setTimeout> | null
    repeat: ReturnType<typeof setInterval> | null
  }>({ hold: null, repeat: null })

  const stop = useCallback(() => {
    const timers = timersRef.current
    if (timers.hold !== null) clearTimeout(timers.hold)
    if (timers.repeat !== null) clearInterval(timers.repeat)
    timersRef.current = { hold: null, repeat: null }
  }, [])

  const start = useCallback(() => {
    stop()
    const hold = setTimeout(() => {
      timersRef.current = {
        hold: null,
        repeat: setInterval(() => {
          if (!fireRef.current()) stop()
        }, 120),
      }
    }, 400)
    timersRef.current = { hold, repeat: null }
  }, [stop])

  useEffect(() => stop, [stop])

  return { start, stop }
}

/**
 * 터치 전용 숫자 입력 — 키보드 없이 −/+ 만으로 조작한다.
 * 판 옆에서 한 손으로 쓰는 앱이라 number input 대신 이것을 기본으로 쓴다.
 * 짧은 탭은 1스텝, 길게 누르면 자동 반복. 첫 스텝은 pointerdown 에서 즉시 나가고
 * click 은 키보드 활성화(detail === 0)만 처리해 이중 발화를 막는다.
 */
export function Stepper({
  value,
  onChange,
  min = 1,
  max = 1_000_000,
  step = 1,
  ariaLabel,
  className,
  decreaseLabel = '줄이기',
  increaseLabel = '늘리기',
}: {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  step?: number
  ariaLabel: string
  className?: string
  /** −버튼 aria-label. 기본은 한국어 '줄이기' — i18n 소비자는 로케일 문자열로 오버라이드한다. */
  decreaseLabel?: string
  /** +버튼 aria-label. 기본은 한국어 '늘리기'. */
  increaseLabel?: string
}) {
  // 홀드 반복 콜백이 항상 최신 value 를 읽도록 ref 로 추적한다.
  const valueRef = useRef(value)
  useEffect(() => {
    valueRef.current = value
  }, [value])

  const stepBy = (direction: 1 | -1): boolean => {
    const next = Math.min(max, Math.max(min, valueRef.current + direction * step))
    if (next === valueRef.current) return false
    onChange(next)
    return true
  }
  const decreaseHold = useHoldRepeat(() => stepBy(-1))
  const increaseHold = useHoldRepeat(() => stepBy(1))

  const buttonClass =
    'm-1 min-h-12 min-w-12 select-none rounded-lg bg-white/[0.07] text-xl font-bold text-text/80 shadow-[0_1px_0_rgb(255_255_255/0.06)_inset] transition-all touch-manipulation active:scale-95 active:bg-white/15 disabled:cursor-not-allowed disabled:opacity-25'
  return (
    <div
      className={clsx(
        'flex items-stretch overflow-hidden rounded-xl border border-gold/20 bg-bg-deep/70',
        className,
      )}
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className={buttonClass}
        disabled={value <= min}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          stepBy(-1)
          decreaseHold.start()
        }}
        onPointerUp={decreaseHold.stop}
        onPointerLeave={decreaseHold.stop}
        onPointerCancel={decreaseHold.stop}
        onClick={(event) => {
          if (event.detail === 0) stepBy(-1)
        }}
        aria-label={decreaseLabel}
      >
        −
      </button>
      <div className="gilt flex min-w-16 flex-1 items-center justify-center px-2 text-xl font-black tabular-nums">
        {value.toLocaleString()}
      </div>
      <button
        type="button"
        className={buttonClass}
        disabled={value >= max}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          stepBy(1)
          increaseHold.start()
        }}
        onPointerUp={increaseHold.stop}
        onPointerLeave={increaseHold.stop}
        onPointerCancel={increaseHold.stop}
        onClick={(event) => {
          if (event.detail === 0) stepBy(1)
        }}
        aria-label={increaseLabel}
      >
        +
      </button>
    </div>
  )
}
