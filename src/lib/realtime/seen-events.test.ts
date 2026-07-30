import { describe, expect, it } from 'vitest'
import { SeenEventIds } from './seen-events'

describe('SeenEventIds', () => {
  it('처음 보는 id는 true를 돌려준다', () => {
    const seen = new SeenEventIds()
    expect(seen.record('a')).toBe(true)
  })

  it('같은 id를 두번째 보면 false를 돌려준다', () => {
    const seen = new SeenEventIds()
    seen.record('a')
    expect(seen.record('a')).toBe(false)
  })

  it('다른 id는 독립적으로 취급한다', () => {
    const seen = new SeenEventIds()
    expect(seen.record('a')).toBe(true)
    expect(seen.record('b')).toBe(true)
    expect(seen.record('a')).toBe(false)
  })

  it('상한을 넘으면 가장 오래된 id를 잊는다 (무한 증가 금지)', () => {
    const seen = new SeenEventIds(2)
    expect(seen.record('a')).toBe(true)
    expect(seen.record('b')).toBe(true)
    expect(seen.size).toBe(2)

    // inserting 'c' pushes the cap and evicts the oldest ('a')
    expect(seen.record('c')).toBe(true)
    expect(seen.size).toBe(2)

    // 'a' was evicted, so it's treated as new again — which itself evicts
    // the now-oldest entry ('b')
    expect(seen.record('a')).toBe(true)
    // 'c' was never evicted, so it's still remembered
    expect(seen.record('c')).toBe(false)
    expect(seen.size).toBe(2)
  })
})
