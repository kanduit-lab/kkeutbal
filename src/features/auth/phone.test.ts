import { describe, it, expect } from 'vitest'
import { formatPhone } from './phone'

describe('formatPhone', () => {
  it('11자리 휴대폰을 3-4-4로 끊는다', () => {
    expect(formatPhone('01012345678')).toBe('010-1234-5678')
  })

  it('10자리 휴대폰을 3-3-4로 끊는다', () => {
    expect(formatPhone('0111234567')).toBe('011-123-4567')
  })

  it('이미 하이픈이 있어도 같은 결과로 정규화한다', () => {
    expect(formatPhone('010-1234-5678')).toBe('010-1234-5678')
  })

  it('숫자가 아닌 문자는 버리고 포맷한다', () => {
    expect(formatPhone('010 1234 5678')).toBe('010-1234-5678')
  })

  it('타이핑 중인 앞자리는 점진적으로 끊는다', () => {
    expect(formatPhone('010')).toBe('010')
    expect(formatPhone('0101')).toBe('010-1')
    expect(formatPhone('0101234')).toBe('010-1234')
  })

  it('11자리를 넘는 입력은 잘라서 반영한다', () => {
    expect(formatPhone('010123456789')).toBe('010-1234-5678')
  })

  it('빈 문자열은 그대로 돌려준다', () => {
    expect(formatPhone('')).toBe('')
  })
})
