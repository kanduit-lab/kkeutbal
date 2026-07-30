import { describe, expect, it } from 'vitest'
import {
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_BASE_DELAYS_MS,
  jitteredDelayMs,
  nextReconnectDelayMs,
  shouldRetryConnect,
} from './reconnect-backoff'

describe('jitteredDelayMs', () => {
  it('최소치는 base의 절반이다 (random=0)', () => {
    expect(jitteredDelayMs(1_000, () => 0)).toBe(500)
  })

  it('최대치는 base 그대로다 (random=1)', () => {
    expect(jitteredDelayMs(1_000, () => 1)).toBe(1_000)
  })

  it('중간값은 절반 구간 사이 어딘가다', () => {
    const delay = jitteredDelayMs(1_000, () => 0.5)
    expect(delay).toBeGreaterThanOrEqual(500)
    expect(delay).toBeLessThanOrEqual(1_000)
  })
})

describe('nextReconnectDelayMs', () => {
  it('시도 0회차는 첫 base 지연을 쓴다', () => {
    const delay = nextReconnectDelayMs(0, () => 0)
    expect(delay).toBe(RECONNECT_BASE_DELAYS_MS[0] / 2)
  })

  it('목록보다 시도 횟수가 많아지면 마지막 base(상한)에 고정된다', () => {
    const last = RECONNECT_BASE_DELAYS_MS[RECONNECT_BASE_DELAYS_MS.length - 1]
    const delay = nextReconnectDelayMs(999, () => 1)
    expect(delay).toBe(last)
  })

  it('같은 attempt라도 random 값이 다르면 지연이 달라진다 (지터 확인)', () => {
    const low = nextReconnectDelayMs(2, () => 0)
    const high = nextReconnectDelayMs(2, () => 1)
    expect(high).toBeGreaterThan(low)
  })
})

describe('shouldRetryConnect', () => {
  it('상한 미만이면 재시도를 허용한다', () => {
    expect(shouldRetryConnect(0)).toBe(true)
    expect(shouldRetryConnect(MAX_RECONNECT_ATTEMPTS - 1)).toBe(true)
  })

  it('상한에 도달하면 더 이상 자동 재시도하지 않는다', () => {
    expect(shouldRetryConnect(MAX_RECONNECT_ATTEMPTS)).toBe(false)
    expect(shouldRetryConnect(MAX_RECONNECT_ATTEMPTS + 5)).toBe(false)
  })
})
