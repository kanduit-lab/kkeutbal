import { describe, expect, it } from 'vitest'
import { MAX_SEND_ATTEMPTS, sendRetryDelayMs } from './send-retry'

describe('sendRetryDelayMs', () => {
  it('첫 재시도 전에는 300ms를 기다린다', () => {
    expect(sendRetryDelayMs(0)).toBe(300)
  })

  it('두번째 재시도 전에는 800ms를 기다린다', () => {
    expect(sendRetryDelayMs(1)).toBe(800)
  })

  it('정의된 지연 구간을 넘어서면 마지막 값에 고정된다', () => {
    expect(sendRetryDelayMs(5)).toBe(800)
  })
})

describe('MAX_SEND_ATTEMPTS', () => {
  it('최초 시도 + 재시도 지연 개수가 서로 맞는다', () => {
    // MAX_SEND_ATTEMPTS 는 "최초 시도 1회 + 재시도 횟수" 총합이어야 한다.
    expect(MAX_SEND_ATTEMPTS).toBe(3)
  })
})
