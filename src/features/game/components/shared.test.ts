import { describe, expect, it } from 'vitest'
import { formatChips } from './shared'

/**
 * formatChips 로케일별 축약 테스트.
 * ko: 10만(100,000) 미만은 평문, 이상은 '만' 단위 축약.
 * en: 1만(10,000) 미만은 평문, 이상은 k/M 단위 축약.
 */
describe('formatChips', () => {
  describe('ko (기본값)', () => {
    it('10만 미만은 천 단위 구분자만 붙인다', () => {
      expect(formatChips(99_999)).toBe('99,999')
      expect(formatChips(0)).toBe('0')
    })

    it('10만 이상은 만 단위로 축약한다', () => {
      expect(formatChips(125_000)).toBe('12.5만')
      expect(formatChips(10_000_000)).toBe('1,000만')
    })

    it('locale 을 명시적으로 ko 로 넘겨도 동일하다', () => {
      expect(formatChips(125_000, 'ko')).toBe('12.5만')
    })
  })

  describe('en', () => {
    it('1만 미만은 천 단위 구분자가 있는 평문 숫자다', () => {
      expect(formatChips(9_999, 'en')).toBe('9,999')
      expect(formatChips(0, 'en')).toBe('0')
    })

    it('1만 이상 100만 미만은 k 단위로 축약한다', () => {
      expect(formatChips(10_000, 'en')).toBe('10k')
      expect(formatChips(12_500, 'en')).toBe('12.5k')
    })

    it('100만 이상은 M 단위로 축약한다', () => {
      expect(formatChips(1_000_000, 'en')).toBe('1M')
      expect(formatChips(2_500_000, 'en')).toBe('2.5M')
    })

    it('소수는 최대 1자리까지만 보여주고 불필요한 .0 은 생략한다', () => {
      expect(formatChips(10_000, 'en')).not.toContain('.0')
      expect(formatChips(1_000_000, 'en')).not.toContain('.0')
    })

    it('음수도 부호를 유지한 채 축약한다', () => {
      expect(formatChips(-12_500, 'en')).toBe('-12.5k')
    })
  })
})
