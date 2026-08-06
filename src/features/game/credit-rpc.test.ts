import { describe, expect, it } from 'vitest'
import { isInsufficientCreditError } from './credit-rpc'

/**
 * 크레딧 부족은 `post_credit_transaction`이 던지는 `raise exception`이라 SQLSTATE가 일반값
 * (P0001)뿐이다. 그래서 문자열로 가려낸다 — 그 판정이 다른 P0001까지 삼키면 진짜 원인이
 * "크레딧 부족"으로 잘못 표시되므로, 무엇을 통과시키고 무엇을 안 통과시키는지 고정해 둔다.
 */
describe('isInsufficientCreditError', () => {
  it('recognizes the postgres exception raised when available credit would go negative', () => {
    expect(isInsufficientCreditError(new Error('insufficient virtual credit'))).toBe(true)
  })

  it('recognizes it inside the wrapped driver message', () => {
    const error = Object.assign(new Error('insufficient virtual credit'), {
      code: 'P0001',
      severity: 'ERROR',
    })
    expect(isInsufficientCreditError(error)).toBe(true)
  })

  it('leaves other room-credit failures alone', () => {
    expect(
      isInsufficientCreditError(new Error('room credit settlement does not conserve locked credits')),
    ).toBe(false)
    expect(isInsufficientCreditError(new Error('room is not accepting credits'))).toBe(false)
    expect(isInsufficientCreditError(new Error('insufficient balance'))).toBe(false)
  })

  it('does not throw on non-error rejections', () => {
    expect(isInsufficientCreditError(undefined)).toBe(false)
    expect(isInsufficientCreditError(null)).toBe(false)
    expect(isInsufficientCreditError('insufficient virtual credit')).toBe(false)
    expect(isInsufficientCreditError({ message: 42 })).toBe(false)
  })
})
