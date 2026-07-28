'use client'

const MUTE_KEY = 'kkeutbal:muted'

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
  tone(ac, { freq: 220, duration: 0.16, type: 'sawtooth', gain: 0.06 })
  tone(ac, { freq: 165, start: 0.08, duration: 0.18, type: 'sawtooth', gain: 0.05 })
}