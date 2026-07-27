import { describe, expect, it } from 'vitest'
import {
  betLabelsFor,
  formatChips,
  isKnownVoidReason,
  lastAcceptedByUser,
  nonFoldedParticipantIds,
  raisePresets,
  VOID_REASONS,
} from './shared'
import type { BetActionView } from '../types'

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

describe('베팅 UI 파생 규칙', () => {
  it('게임별 기본 라벨을 고르고 고스톱은 섯다 라벨로 폴백한다', () => {
    expect(betLabelsFor('seotda').fold).toBe('다이')
    expect(betLabelsFor('poker').fold).toBe('폴드')
    expect(betLabelsFor('gostop').raise).toBe('올려')
  })

  it('사용자별 마지막 accepted 액션만 남긴다', () => {
    const base = {
      roundId: '00000000-0000-4000-8000-000000000001',
      enteredBy: null,
      amount: 0,
      reason: null,
      createdAt: new Date(0).toISOString(),
    }
    const actions: BetActionView[] = [
      { ...base, id: 'a', userId: 'u1', action: 'check', status: 'accepted', seq: 1 },
      { ...base, id: 'b', userId: 'u1', action: 'raise', status: 'rejected', seq: 2 },
      { ...base, id: 'c', userId: 'u2', action: 'fold', status: 'accepted', seq: 3 },
      { ...base, id: 'd', userId: 'u1', action: 'call', status: 'accepted', seq: 4 },
    ]
    const result = lastAcceptedByUser(actions)
    expect(result.get('u1')?.id).toBe('d')
    expect(result.get('u2')?.id).toBe('c')
  })

  it('다이한 참가자는 승자 후보에서 빼고 정정된 다이는 다시 포함한다', () => {
    const base = {
      roundId: '00000000-0000-4000-8000-000000000001',
      enteredBy: null,
      amount: 0,
      reason: null,
      createdAt: new Date(0).toISOString(),
    }
    const actions: BetActionView[] = [
      { ...base, id: 'check', userId: 'u1', action: 'check', status: 'accepted', seq: 1 },
      { ...base, id: 'fold', userId: 'u2', action: 'fold', status: 'accepted', seq: 2 },
      { ...base, id: 'reverted-fold', userId: 'u3', action: 'fold', status: 'reverted', seq: 3 },
    ]

    expect(nonFoldedParticipantIds(['u1', 'u2', 'u3'], actions)).toEqual(['u1', 'u3'])
  })

  it('섯다·포커 프리셋을 팟과 직전 베팅에서 계산하고 0원 항목은 버린다', () => {
    expect(
      raisePresets('seotda', { lastBet: 100, pot: 450, base: 50 }).map((x) => x.amount),
    ).toEqual([50, 200, 225, 450])
    expect(
      raisePresets('poker', { lastBet: 100, pot: 450, base: 50 }).map((x) => x.amount),
    ).toEqual([200, 225, 450])
    expect(raisePresets('poker', { lastBet: 0, pot: 0, base: 50 })).toEqual([])
  })
})

/**
 * round.voided 브로드캐스트의 reason 은 공개 채널에서 온다 — 방 UUID 를 아는 누구나
 * 1~200자 임의 문자열을 실을 수 있다. 앱이 쓴 문장처럼 렌더되기 전에 걸러야 한다.
 */
describe('isKnownVoidReason', () => {
  it('프리셋 사유는 전부 통과시킨다', () => {
    for (const preset of VOID_REASONS) {
      expect(isKnownVoidReason(preset.value)).toBe(true)
    }
  })

  it('프리셋 밖의 임의 문자열은 거부한다', () => {
    expect(isKnownVoidReason('')).toBe(false)
    expect(isKnownVoidReason('재경기 ')).toBe(false)
    expect(isKnownVoidReason('관리자입니다 지금 나가세요')).toBe(false)
    expect(isKnownVoidReason('<img src=x onerror=alert(1)>')).toBe(false)
    expect(isKnownVoidReason('x'.repeat(200))).toBe(false)
  })

  it('프로토타입 체인 키를 사유로 위장해도 거부한다', () => {
    expect(isKnownVoidReason('constructor')).toBe(false)
    expect(isKnownVoidReason('__proto__')).toBe(false)
    expect(isKnownVoidReason('toString')).toBe(false)
  })
})
