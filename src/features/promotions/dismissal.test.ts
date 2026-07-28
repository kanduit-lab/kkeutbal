import { afterEach, describe, it, expect, vi } from 'vitest'
import {
  isDismissed,
  parseDismissals,
  pruneDismissals,
  readDismissals,
  withDismissal,
  writeDismissals,
  type DismissMap,
} from './dismissal'

const NOW = 1_800_000_000_000
const HOUR = 60 * 60 * 1000

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('withDismissal', () => {
  it('지정한 시간만큼 뒤로 만료를 잡는다', () => {
    const next = withDismissal({}, 'a', 24, NOW)
    expect(next.a).toBe(NOW + 24 * HOUR)
  })

  it('인자로 받은 맵을 변형하지 않는다', () => {
    const before: DismissMap = { a: NOW + HOUR }
    const next = withDismissal(before, 'b', 24, NOW)
    expect(before).toEqual({ a: NOW + HOUR })
    expect(next).not.toBe(before)
  })

  it('닫을 때 만료된 항목을 같이 걷어낸다', () => {
    const next = withDismissal({ old: NOW - HOUR, live: NOW + HOUR }, 'new', 24, NOW)
    expect(next.old).toBeUndefined()
    expect(next.live).toBe(NOW + HOUR)
  })

  it('0 이하나 NaN 은 1시간으로 끌어올려 영구 숨김을 막는다', () => {
    expect(withDismissal({}, 'a', 0, NOW).a).toBe(NOW + HOUR)
    expect(withDismissal({}, 'a', -5, NOW).a).toBe(NOW + HOUR)
    expect(withDismissal({}, 'a', Number.NaN, NOW).a).toBe(NOW + HOUR)
  })
})

describe('isDismissed', () => {
  it('만료 전이면 숨긴 상태다', () => {
    expect(isDismissed({ a: NOW + HOUR }, 'a', NOW)).toBe(true)
  })

  it('만료됐거나 없으면 다시 보여준다', () => {
    expect(isDismissed({ a: NOW - 1 }, 'a', NOW)).toBe(false)
    expect(isDismissed({}, 'a', NOW)).toBe(false)
  })

  it('만료 시각과 정확히 같은 순간에는 다시 보여준다', () => {
    expect(isDismissed({ a: NOW }, 'a', NOW)).toBe(false)
  })
})

describe('pruneDismissals', () => {
  it('만료된 항목만 버린다', () => {
    expect(pruneDismissals({ old: NOW - 1, live: NOW + 1 }, NOW)).toEqual({ live: NOW + 1 })
  })
})

describe('parseDismissals', () => {
  it('정상 JSON 을 맵으로 읽는다', () => {
    expect(parseDismissals('{"a":123}')).toEqual({ a: 123 })
  })

  it('깨진 입력은 빈 맵으로 떨어진다', () => {
    expect(parseDismissals(null)).toEqual({})
    expect(parseDismissals('not json')).toEqual({})
    expect(parseDismissals('[1,2]')).toEqual({})
    expect(parseDismissals('"text"')).toEqual({})
  })

  it('숫자가 아닌 값은 버린다', () => {
    expect(parseDismissals('{"a":"soon","b":5}')).toEqual({ b: 5 })
  })
})

describe('localStorage 경계', () => {
  it('서버에서는 읽기·쓰기를 조용히 생략한다', () => {
    expect(readDismissals()).toEqual({})
    expect(() => writeDismissals({ a: NOW })).not.toThrow()
  })

  it('브라우저 저장소에서 읽고 쓴다', () => {
    const getItem = vi.fn(() => '{"a":123}')
    const setItem = vi.fn()
    vi.stubGlobal('window', { localStorage: { getItem, setItem } })
    expect(readDismissals()).toEqual({ a: 123 })
    writeDismissals({ b: 456 })
    expect(setItem).toHaveBeenCalledWith('kkeutbal:promo-dismissed', '{"b":456}')
  })

  it('저장소 접근 오류는 빈 값/무시로 복구한다', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked')
        },
        setItem: () => {
          throw new Error('blocked')
        },
      },
    })
    expect(readDismissals()).toEqual({})
    expect(() => writeDismissals({ a: NOW })).not.toThrow()
    expect(error).toHaveBeenCalledTimes(2)
  })
})