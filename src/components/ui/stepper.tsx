'use client'

import { clsx } from 'clsx'
import { useCallback, useEffect, useRef } from 'react'

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

export function Stepper({
  value,
  onChange,
  min = 1,
  max = 1_000_000,
  step = 1,
  ariaLabel,
  className,
  decreaseLabel,
  increaseLabel,
}: {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  step?: number
  ariaLabel: string
  className?: string

  decreaseLabel: string
  increaseLabel: string
}) {
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