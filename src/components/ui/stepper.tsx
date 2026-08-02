'use client'

import { clsx } from 'clsx'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from './modal'
import { Input } from './input'
import { format, useDict } from '@/lib/i18n/client'

/** 누르고 있을 때 첫 반복까지 기다리는 시간(ms) */
const HOLD_DELAY_MS = 400
/** 반복 간격(ms) */
const REPEAT_MS = 90

/**
 * 누르고 있는 시간이 길어질수록 한 번에 뛰는 폭을 키운다.
 * `[반복 횟수 문턱, step 배수]` — 앞에서부터 넘은 것 중 마지막이 쓰인다.
 *
 * 고정 배수 1로 반복하면 1 → 10,000까지 가는 데 손가락을 15분 올려놔야 한다. 그렇다고
 * 처음부터 크게 뛰면 100 근처의 작은 조정이 불가능해진다. 그래서 처음 1초 남짓은 step
 * 그대로 가고, 계속 누르고 있을 때만 배수를 올린다.
 */
const ACCELERATION: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [10, 5],
  [20, 25],
  [35, 100],
  [50, 500],
]

function multiplierFor(ticks: number): number {
  let multiplier = 1
  for (const [threshold, value] of ACCELERATION) {
    if (ticks >= threshold) multiplier = value
  }
  return multiplier
}

/**
 * 값을 step 격자에 맞춘다. 격자를 벗어난 값(직접 입력한 137 등)에서 눌러도 다음 값이
 * 140·130 같은 깔끔한 수가 되고, min=1 step=10에서 1 → 11 → 21 대신 1 → 10 → 20으로 간다.
 * 진행 방향으로는 절대 되돌아가지 않도록 올림/내림 방향을 direction에 맞춘다.
 */
function snap(value: number, step: number, direction: 1 | -1): number {
  if (step <= 1) return value
  return direction === 1 ? Math.floor(value / step) * step : Math.ceil(value / step) * step
}

function useHoldRepeat(fire: (multiplier: number) => boolean) {
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
      let ticks = 0
      timersRef.current = {
        hold: null,
        repeat: setInterval(() => {
          ticks += 1
          if (!fireRef.current(multiplierFor(ticks))) stop()
        }, REPEAT_MS),
      }
    }, HOLD_DELAY_MS)
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
  const { d } = useDict()
  const valueRef = useRef(value)
  useEffect(() => {
    valueRef.current = value
  }, [value])

  const [editOpen, setEditOpen] = useState(false)
  const [draft, setDraft] = useState('')

  const stepBy = (direction: 1 | -1, multiplier = 1): boolean => {
    const current = valueRef.current
    const raw = current + direction * step * multiplier
    const next = Math.min(max, Math.max(min, snap(raw, step, direction)))
    if (next === current) return false
    onChange(next)
    return true
  }
  const decreaseHold = useHoldRepeat((multiplier) => stepBy(-1, multiplier))
  const increaseHold = useHoldRepeat((multiplier) => stepBy(1, multiplier))

  // 숫자만 남긴다 — 모바일 숫자 키패드에서도 콤마·공백이 섞여 들어온다.
  const parsedDraft = Number.parseInt(draft.replace(/[^0-9-]/g, ''), 10)
  const draftValid = Number.isFinite(parsedDraft) && parsedDraft >= min && parsedDraft <= max

  function openEdit() {
    setDraft(String(value))
    setEditOpen(true)
  }

  function applyEdit() {
    if (!draftValid) return
    onChange(parsedDraft)
    setEditOpen(false)
  }

  const range = { min: min.toLocaleString(), max: max.toLocaleString() }

  const buttonClass =
    'm-1 min-h-12 min-w-12 select-none rounded-lg bg-white/[0.07] text-xl font-bold text-text/80 shadow-[0_1px_0_rgb(255_255_255/0.06)_inset] transition-all touch-manipulation active:scale-95 active:bg-white/15 disabled:cursor-not-allowed disabled:opacity-25'
  return (
    <>
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
        {/*
          숫자 자체가 버튼이다. +/− 만 있으면 1에서 10,000으로 가는 길이 누르고 있기밖에
          없어서, 값을 아는 사람이 그 값을 바로 넣을 방법이 없었다.
        */}
        <button
          type="button"
          onClick={openEdit}
          aria-label={`${ariaLabel} · ${d.ui.editValue}`}
          className="gilt flex min-w-16 flex-1 cursor-pointer items-center justify-center px-2 text-xl font-black tabular-nums transition hover:bg-white/[0.06] active:bg-white/10"
        >
          {value.toLocaleString()}
        </button>
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
      <ConfirmDialog
        open={editOpen}
        title={`${ariaLabel} · ${d.ui.editValue}`}
        body={format(d.ui.editValueHint, range)}
        confirmLabel={d.ui.apply}
        cancelLabel={d.ui.cancel}
        confirmDisabled={!draftValid}
        onConfirm={applyEdit}
        onClose={() => setEditOpen(false)}
      >
        <Input
          type="text"
          inputMode="numeric"
          autoFocus
          value={draft}
          aria-label={ariaLabel}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              applyEdit()
            }
          }}
        />
        {draft !== '' && !draftValid ? (
          <p className="mt-1.5 text-xs text-danger">{format(d.ui.editValueInvalid, range)}</p>
        ) : null}
      </ConfirmDialog>
    </>
  )
}
