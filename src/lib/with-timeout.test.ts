import { describe, expect, it, vi } from 'vitest'
import { TimeoutError, withTimeout } from './with-timeout'

describe('withTimeout', () => {
  it('상한 안에 끝난 값을 그대로 돌려준다', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50, 'fast')).resolves.toBe('ok')
  })

  it('원본 거절은 TimeoutError 로 바꾸지 않고 그대로 전달한다', async () => {
    const failure = new Error('query failed')
    await expect(withTimeout(Promise.reject(failure), 50, 'failing')).rejects.toBe(failure)
  })

  it('끝나지 않는 작업을 상한에서 끊는다', async () => {
    vi.useFakeTimers()
    try {
      const pending = withTimeout(new Promise<never>(() => {}), 2_000, 'stalled')
      const asserted = expect(pending).rejects.toBeInstanceOf(TimeoutError)
      await vi.advanceTimersByTimeAsync(2_000)
      await asserted
    } finally {
      vi.useRealTimers()
    }
  })

  it('drizzle 같은 thenable 도 받는다', async () => {
    const thenable: PromiseLike<number> = { then: (resolve) => resolve?.(7) as never }
    await expect(withTimeout(thenable, 50, 'thenable')).resolves.toBe(7)
  })
})