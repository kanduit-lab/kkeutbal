import { describe, expect, it } from 'vitest'
import { isRaiseRule, raiseRuleViolation } from './raise-rule'

describe('isRaiseRule', () => {
  it('세 값만 유효하다', () => {
    expect(isRaiseRule('free')).toBe(true)
    expect(isRaiseRule('ttadang')).toBe(true)
    expect(isRaiseRule('pot_limit')).toBe(true)
    expect(isRaiseRule('other')).toBe(false)
    expect(isRaiseRule(undefined)).toBe(false)
  })
})

describe('raiseRuleViolation — free', () => {
  it('무엇을 넣어도 통과한다', () => {
    expect(
      raiseRuleViolation({
        rule: 'free',
        amount: 12345,
        contributionBefore: 0,
        lastBet: 100,
        baseBet: 10,
        pot: 50,
      }),
    ).toBe(null)
  })
})

describe('raiseRuleViolation — ttadang', () => {
  it('첫 베팅(lastBet=0)은 baseBet과 정확히 같아야 한다', () => {
    expect(
      raiseRuleViolation({
        rule: 'ttadang',
        amount: 10,
        contributionBefore: 0,
        lastBet: 0,
        baseBet: 10,
        pot: 0,
      }),
    ).toBe(null)
    expect(
      raiseRuleViolation({
        rule: 'ttadang',
        amount: 11,
        contributionBefore: 0,
        lastBet: 0,
        baseBet: 10,
        pot: 0,
      }),
    ).toBe('errors.raiseMustFollowTtadang')
  })

  it('재레이즈는 직전 최고 베팅액의 정확히 2배만 허용한다', () => {
    // lastBet=100, contributionBefore=0 → totalAfter는 amount와 같음 → 200이어야 통과
    expect(
      raiseRuleViolation({
        rule: 'ttadang',
        amount: 200,
        contributionBefore: 0,
        lastBet: 100,
        baseBet: 10,
        pot: 100,
      }),
    ).toBe(null)
    expect(
      raiseRuleViolation({
        rule: 'ttadang',
        amount: 150,
        contributionBefore: 0,
        lastBet: 100,
        baseBet: 10,
        pot: 100,
      }),
    ).toBe('errors.raiseMustFollowTtadang')
  })

  it('이미 일부 낸 참가자는 목표 총액에서 기존 기여를 뺀 만큼만 추가로 낸다', () => {
    // 목표 총액 = lastBet*2 = 200, 이미 50을 냈으므로 이번에 150을 더 내야 정확히 200
    expect(
      raiseRuleViolation({
        rule: 'ttadang',
        amount: 150,
        contributionBefore: 50,
        lastBet: 100,
        baseBet: 10,
        pot: 150,
      }),
    ).toBe(null)
  })
})

describe('raiseRuleViolation — pot_limit', () => {
  it('레이즈 뒤 누적 베팅이 팟 이하면 통과', () => {
    expect(
      raiseRuleViolation({
        rule: 'pot_limit',
        amount: 100,
        contributionBefore: 0,
        lastBet: 0,
        baseBet: 10,
        pot: 100,
      }),
    ).toBe(null)
  })

  it('레이즈 뒤 누적 베팅이 팟을 넘으면 거부', () => {
    expect(
      raiseRuleViolation({
        rule: 'pot_limit',
        amount: 101,
        contributionBefore: 0,
        lastBet: 0,
        baseBet: 10,
        pot: 100,
      }),
    ).toBe('errors.raiseExceedsPotLimit')
  })

  it('기존 기여분을 합산해서 판단한다', () => {
    expect(
      raiseRuleViolation({
        rule: 'pot_limit',
        amount: 60,
        contributionBefore: 50,
        lastBet: 50,
        baseBet: 10,
        pot: 100,
      }),
    ).toBe('errors.raiseExceedsPotLimit')
  })
})
