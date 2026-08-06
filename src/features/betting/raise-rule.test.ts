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
  it('판을 여는 첫 베팅은 baseBet까지 허용한다 — 팟이 0이라 상한이 0이면 아무도 못 연다', () => {
    expect(
      raiseRuleViolation({
        rule: 'pot_limit',
        amount: 100,
        contributionBefore: 0,
        lastBet: 0,
        baseBet: 100,
        pot: 0,
      }),
    ).toBe(null)
    expect(
      raiseRuleViolation({
        rule: 'pot_limit',
        amount: 101,
        contributionBefore: 0,
        lastBet: 0,
        baseBet: 100,
        pot: 0,
      }),
    ).toBe('errors.raiseExceedsPotLimit')
  })

  it('맞상대(2인) 레이즈 상한은 콜을 채운 뒤의 팟 = lastBet + pot + 콜 부족액', () => {
    // a가 100을 걸어 팟 100, lastBet 100. b는 콜 100을 채운 뒤 팟(200)만큼 더 걸 수 있다 → 300
    expect(
      raiseRuleViolation({
        rule: 'pot_limit',
        amount: 300,
        contributionBefore: 0,
        lastBet: 100,
        baseBet: 10,
        pot: 100,
      }),
    ).toBe(null)
    expect(
      raiseRuleViolation({
        rule: 'pot_limit',
        amount: 301,
        contributionBefore: 0,
        lastBet: 100,
        baseBet: 10,
        pot: 100,
      }),
    ).toBe('errors.raiseExceedsPotLimit')
  })

  it('기존 기여분을 합산해서 판단한다 — 재레이즈 상한도 같은 공식', () => {
    // a 100, b 300 → 팟 400, lastBet 300. a는 콜 200을 채운 뒤 팟(600)만큼 더 → 누적 900까지
    expect(
      raiseRuleViolation({
        rule: 'pot_limit',
        amount: 800,
        contributionBefore: 100,
        lastBet: 300,
        baseBet: 10,
        pot: 400,
      }),
    ).toBe(null)
    expect(
      raiseRuleViolation({
        rule: 'pot_limit',
        amount: 801,
        contributionBefore: 100,
        lastBet: 300,
        baseBet: 10,
        pot: 400,
      }),
    ).toBe('errors.raiseExceedsPotLimit')
  })
})
