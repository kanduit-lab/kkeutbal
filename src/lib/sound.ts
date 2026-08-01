'use client'

import type { BetActionKind } from '@/features/game/types'

const MUTE_KEY = 'kkeutbal:muted'

// 자기 액션은 살짝 크게 — 개별 gain 최대치가 0.25대라 1.25배도 클리핑(1.0) 여유가 넉넉하다
const SELF_GAIN = 1.25

let ctx: AudioContext | null = null

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    try {
      ctx = new AudioContext()
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function isMuted(): boolean {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem(MUTE_KEY) === '1'
}

export function setMuted(muted: boolean): void {
  window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
}

function tone(
  ac: AudioContext,
  {
    freq,
    start = 0,
    duration = 0.12,
    type = 'sine',
    gain = 0.12,
  }: { freq: number; start?: number; duration?: number; type?: OscillatorType; gain?: number },
) {
  const osc = ac.createOscillator()
  const amp = ac.createGain()
  osc.type = type
  osc.frequency.value = freq
  const t0 = ac.currentTime + start
  amp.gain.setValueAtTime(0, t0)
  amp.gain.linearRampToValueAtTime(gain, t0 + 0.008)
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(amp).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.02)
}

function clack(ac: AudioContext, start = 0, gain = 0.25) {
  const length = Math.floor(ac.sampleRate * 0.04)
  const buffer = ac.createBuffer(1, length, ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2
  }
  const src = ac.createBufferSource()
  src.buffer = buffer
  const filter = ac.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 2600
  filter.Q.value = 1.2
  const amp = ac.createGain()
  amp.gain.value = gain
  src.connect(filter).connect(amp).connect(ac.destination)
  src.start(ac.currentTime + start)
}

function sweep(
  ac: AudioContext,
  {
    from,
    to,
    start = 0,
    duration = 0.3,
    type = 'sawtooth',
    gain = 0.1,
  }: {
    from: number
    to: number
    start?: number
    duration?: number
    type?: OscillatorType
    gain?: number
  },
) {
  const osc = ac.createOscillator()
  const amp = ac.createGain()
  osc.type = type
  const t0 = ac.currentTime + start
  osc.frequency.setValueAtTime(from, t0)
  osc.frequency.exponentialRampToValueAtTime(to, t0 + duration)
  amp.gain.setValueAtTime(0, t0)
  amp.gain.linearRampToValueAtTime(gain, t0 + 0.02)
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(amp).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.02)
}

function checkSound(ac: AudioContext, g: number) {
  clack(ac, 0, 0.1 * g)
  clack(ac, 0.07, 0.08 * g)
}

function callSound(ac: AudioContext, g: number) {
  clack(ac, 0, 0.22 * g)
  tone(ac, { freq: 659.25, start: 0.02, duration: 0.09, gain: 0.09 * g })
}

function raiseSound(ac: AudioContext, g: number) {
  clack(ac, 0, 0.24 * g)
  clack(ac, 0.05, 0.18 * g)
  tone(ac, { freq: 587.33, start: 0.02, duration: 0.1, type: 'triangle', gain: 0.1 * g })
  tone(ac, { freq: 880, start: 0.11, duration: 0.14, type: 'triangle', gain: 0.11 * g })
}

function foldSound(ac: AudioContext, g: number) {
  tone(ac, { freq: 220, duration: 0.16, type: 'sawtooth', gain: 0.06 * g })
  tone(ac, { freq: 165, start: 0.08, duration: 0.18, type: 'sawtooth', gain: 0.05 * g })
}

function allinSound(ac: AudioContext, g: number) {
  // 스윕 0.32s + 0.30s 지점 악센트 0.16s = 약 460ms, 500ms 상한 안쪽
  sweep(ac, { from: 220, to: 1320, duration: 0.32, gain: 0.1 * g })
  clack(ac, 0.1, 0.2 * g)
  clack(ac, 0.16, 0.22 * g)
  clack(ac, 0.22, 0.24 * g)
  clack(ac, 0.28, 0.26 * g)
  tone(ac, { freq: 1174.66, start: 0.3, duration: 0.16, type: 'triangle', gain: 0.12 * g })
}

const ACTION_SOUNDS: Record<BetActionKind, (ac: AudioContext, g: number) => void> = {
  check: checkSound,
  call: callSound,
  raise: raiseSound,
  fold: foldSound,
  allin: allinSound,
}

export function playCheck(): void {
  if (isMuted()) return
  const ac = audioContext()
  if (!ac) return
  checkSound(ac, 1)
}

export function playCall(): void {
  if (isMuted()) return
  const ac = audioContext()
  if (!ac) return
  callSound(ac, 1)
}

export function playRaise(): void {
  if (isMuted()) return
  const ac = audioContext()
  if (!ac) return
  raiseSound(ac, 1)
}

export function playAllin(): void {
  if (isMuted()) return
  const ac = audioContext()
  if (!ac) return
  allinSound(ac, 1)
}

export function playTurnAlert(): void {
  if (isMuted()) return
  const ac = audioContext()
  if (!ac) return
  // playWin(0.14~0.16)보다 확실히 낮게 — 반복 알림이라 귀에 부담 없어야 한다
  tone(ac, { freq: 659.25, duration: 0.12, type: 'triangle', gain: 0.07 })
  tone(ac, { freq: 880, start: 0.13, duration: 0.16, type: 'triangle', gain: 0.08 })
}

export function playForAction(action: BetActionKind, options?: { isSelf?: boolean }): void {
  if (isMuted()) return
  const ac = audioContext()
  if (!ac) return
  ACTION_SOUNDS[action](ac, options?.isSelf ? SELF_GAIN : 1)
}

export function playChip(): void {
  if (isMuted()) return
  const ac = audioContext()
  if (!ac) return
  clack(ac, 0)
  clack(ac, 0.045, 0.18)
  tone(ac, { freq: 1900, duration: 0.05, gain: 0.05, start: 0.01 })
}

export function playRoundStart(): void {
  if (isMuted()) return
  const ac = audioContext()
  if (!ac) return
  tone(ac, { freq: 523.25, duration: 0.14, type: 'triangle' })
  tone(ac, { freq: 784, start: 0.1, duration: 0.18, type: 'triangle' })
}

export function playWin(): void {
  if (isMuted()) return
  const ac = audioContext()
  if (!ac) return
  tone(ac, { freq: 523.25, duration: 0.16, type: 'triangle', gain: 0.14 })
  tone(ac, { freq: 659.25, start: 0.11, duration: 0.16, type: 'triangle', gain: 0.14 })
  tone(ac, { freq: 783.99, start: 0.22, duration: 0.22, type: 'triangle', gain: 0.16 })
  clack(ac, 0.3, 0.2)
  clack(ac, 0.36, 0.16)
}

export function playFold(): void {
  if (isMuted()) return
  const ac = audioContext()
  if (!ac) return
  foldSound(ac, 1)
}
