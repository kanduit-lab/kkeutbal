import { describe, expect, it } from 'vitest'
import {
  EVENT_DEBOUNCE_MS,
  INITIAL_COALESCER_STATE,
  MIN_EVENT_INTERVAL_MS,
  noteCoalescedEvent,
  noteCoalescedRefetchRan,
} from './refetch-coalescer'

describe('noteCoalescedEvent', () => {
  it('유휴 상태에서 첫 이벤트는 기본 디바운스(250ms)만 기다린다', () => {
    const { delayMs } = noteCoalescedEvent(INITIAL_COALESCER_STATE, 10_000)
    expect(delayMs).toBe(EVENT_DEBOUNCE_MS)
  })

  it('직전 refetch가 최근이면 최소 간격을 채우도록 더 기다린다', () => {
    const afterRefetch = noteCoalescedRefetchRan(10_000)
    const { delayMs } = noteCoalescedEvent(afterRefetch, 10_300)
    expect(delayMs).toBe(MIN_EVENT_INTERVAL_MS - 300)
  })

  it('버스트가 오래 지속돼도 시작 시점 기준 1초를 넘겨 기다리지 않는다 (starvation 방지)', () => {
    // 직전 refetch는 아주 오래 전이라 원래식(max(250, ...))이면 계속 250ms
    // 바닥으로 재무장돼 버스트가 지속되는 한 절대 안 쏘는 상황을 흉내낸다.
    const longAgoRefetch = noteCoalescedRefetchRan(-1_000_000)
    // 버스트가 900ms째 진행 중
    const burstState = { ...longAgoRefetch, burstStartedAt: 0 }
    const { delayMs } = noteCoalescedEvent(burstState, 900)
    // 원래식이면 250ms가 나와야 하지만 버스트 상한이 100ms로 깎는다
    expect(delayMs).toBe(100)
  })

  it('버스트 상한을 넘기면 지연 없이 즉시 발화하도록 0을 돌려준다', () => {
    const longAgoRefetch = noteCoalescedRefetchRan(-1_000_000)
    const burstState = { ...longAgoRefetch, burstStartedAt: 0 }
    const { delayMs } = noteCoalescedEvent(burstState, 1_500)
    expect(delayMs).toBe(0)
  })

  it('버스트 시작 시각은 이후 이벤트가 와도 갱신되지 않는다 (상한 계산의 기준점 고정)', () => {
    const first = noteCoalescedEvent(INITIAL_COALESCER_STATE, 1_000)
    const second = noteCoalescedEvent(first.state, 1_100)
    expect(second.state.burstStartedAt).toBe(1_000)
  })
})

describe('noteCoalescedRefetchRan', () => {
  it('실행 시각을 기록하고 다음 버스트를 위해 burstStartedAt을 비운다', () => {
    const state = noteCoalescedRefetchRan(5_000)
    expect(state.lastRefetchAt).toBe(5_000)
    expect(state.burstStartedAt).toBeNull()
  })
})
