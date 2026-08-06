import { describe, expect, it } from 'vitest'
import { checkBetAmount } from './bet-amount-rule'
import { roundBetState } from './round-bet-state'

const accepted = (userId: string, action: 'call' | 'raise' | 'allin' | 'fold', amount: number) => ({
  userId,
  action,
  amount,
  status: 'accepted' as const,
})

describe('checkBetAmount', () => {
  it('낼 것이 없으면 check 통과', () => {
    const state = roundBetState([])
    expect(
      checkBetAmount({
        state,
        userId: 'a',
        action: 'check',
        amount: 0,
        balance: 1000,
        baseBet: 10,
        raiseRule: 'free',
      }),
    ).toBeNull()
  })

  it('맞출 베팅이 있는데 check하면 거부', () => {
    const state = roundBetState([accepted('b', 'raise', 100)])
    expect(
      checkBetAmount({
        state,
        userId: 'a',
        action: 'check',
        amount: 0,
        balance: 1000,
        baseBet: 10,
        raiseRule: 'free',
      }),
    ).toBe('errors.cannotCheckAfterBet')
  })

  it('fold는 잔액이 0이어도 항상 통과', () => {
    const state = roundBetState([])
    expect(
      checkBetAmount({
        state,
        userId: 'a',
        action: 'fold',
        amount: 0,
        balance: 0,
        baseBet: 10,
        raiseRule: 'free',
      }),
    ).toBeNull()
  })

  it('잔액이 0 이하면 fold를 제외한 액션은 거부', () => {
    const state = roundBetState([])
    expect(
      checkBetAmount({
        state,
        userId: 'a',
        action: 'raise',
        amount: 10,
        balance: 0,
        baseBet: 10,
        raiseRule: 'free',
      }),
    ).toBe('errors.insufficientBalance')
  })

  it('올인은 잔액 전액과 정확히 같아야 통과', () => {
    const state = roundBetState([])
    expect(
      checkBetAmount({
        state,
        userId: 'a',
        action: 'allin',
        amount: 500,
        balance: 1000,
        baseBet: 10,
        raiseRule: 'free',
      }),
    ).toBe('errors.allInMustUseFullBalance')
    expect(
      checkBetAmount({
        state,
        userId: 'a',
        action: 'allin',
        amount: 1000,
        balance: 1000,
        baseBet: 10,
        raiseRule: 'free',
      }),
    ).toBeNull()
  })

  it('금액이 잔액을 넘으면 거부', () => {
    const state = roundBetState([])
    expect(
      checkBetAmount({
        state,
        userId: 'a',
        action: 'raise',
        amount: 2000,
        balance: 1000,
        baseBet: 10,
        raiseRule: 'free',
      }),
    ).toBe('errors.insufficientBalance')
  })

  it('맞출 베팅이 없는데 call하면 거부', () => {
    const state = roundBetState([])
    expect(
      checkBetAmount({
        state,
        userId: 'a',
        action: 'call',
        amount: 0,
        balance: 1000,
        baseBet: 10,
        raiseRule: 'free',
      }),
    ).toBe('errors.noBetToCall')
  })

  it('call 금액은 콜 필요액과 정확히 같아야 한다', () => {
    const state = roundBetState([accepted('b', 'raise', 100)])
    expect(
      checkBetAmount({
        state,
        userId: 'a',
        action: 'call',
        amount: 50,
        balance: 1000,
        baseBet: 10,
        raiseRule: 'free',
      }),
    ).toBe('errors.invalidCallAmount')
    expect(
      checkBetAmount({
        state,
        userId: 'a',
        action: 'call',
        amount: 100,
        balance: 1000,
        baseBet: 10,
        raiseRule: 'free',
      }),
    ).toBeNull()
  })

  it('잔액이 콜 금액에 못 미치면 짧은 콜을 거부한다 — 바이인하거나 다이해야 한다', () => {
    const state = roundBetState([accepted('b', 'raise', 100)])
    expect(
      checkBetAmount({
        state,
        userId: 'a',
        action: 'call',
        amount: 40,
        balance: 40,
        baseBet: 10,
        raiseRule: 'free',
      }),
    ).toBe('errors.cannotCoverCurrentBet')
  })

  it('잔액이 콜 금액에 못 미치면 짧은 올인도 거부한다 (500칩 vs 5000 레이즈)', () => {
    const state = roundBetState([accepted('b', 'raise', 5000)])
    expect(
      checkBetAmount({
        state,
        userId: 'a',
        action: 'allin',
        amount: 500,
        balance: 500,
        baseBet: 10,
        raiseRule: 'free',
      }),
    ).toBe('errors.cannotCoverCurrentBet')
  })

  it('잔액이 콜 금액을 채우면 올인은 통과한다', () => {
    const state = roundBetState([accepted('b', 'raise', 500)])
    expect(
      checkBetAmount({
        state,
        userId: 'a',
        action: 'allin',
        amount: 500,
        balance: 500,
        baseBet: 10,
        raiseRule: 'free',
      }),
    ).toBeNull()
  })

  it('콜을 못 채우는 잔액이어도 다이는 항상 통과한다 — 유일한 탈출구', () => {
    const state = roundBetState([accepted('b', 'raise', 5000)])
    expect(
      checkBetAmount({
        state,
        userId: 'a',
        action: 'fold',
        amount: 0,
        balance: 500,
        baseBet: 10,
        raiseRule: 'free',
      }),
    ).toBeNull()
  })

  it('레이즈가 최소 레이즈 미만이면 거부', () => {
    const state = roundBetState([accepted('b', 'raise', 100)])
    expect(
      checkBetAmount({
        state,
        userId: 'a',
        action: 'raise',
        amount: 100,
        balance: 1000,
        baseBet: 10,
        raiseRule: 'free',
      }),
    ).toBe('errors.raiseBelowMinimum')
  })

  it('레이즈 금액이 잔액 전액과 같으면 allin 액션을 쓰라고 거부', () => {
    const state = roundBetState([])
    expect(
      checkBetAmount({
        state,
        userId: 'a',
        action: 'raise',
        amount: 1000,
        balance: 1000,
        baseBet: 10,
        raiseRule: 'free',
      }),
    ).toBe('errors.allInMustUseAllInAction')
  })

  it('레이즈 규칙 위반이면 raise-rule의 에러 키를 그대로 반환한다', () => {
    const state = roundBetState([accepted('b', 'raise', 100)])
    expect(
      checkBetAmount({
        state,
        userId: 'a',
        action: 'raise',
        amount: 150,
        balance: 1000,
        baseBet: 10,
        raiseRule: 'ttadang',
      }),
    ).toBe('errors.raiseMustFollowTtadang')
  })

  it('팟 리밋 방에서도 판을 여는 첫 베팅(삥)이 통과한다', () => {
    // 회귀: 상한이 "이 액션 이전 팟"이던 시절엔 팟이 0이라 첫 베팅이 전부 거부됐고,
    // 팟 리밋 방은 올인 말고는 베팅 자체가 불가능했다.
    const state = roundBetState([])
    expect(
      checkBetAmount({
        state,
        userId: 'a',
        action: 'raise',
        amount: 100,
        balance: 10_000,
        baseBet: 100,
        raiseRule: 'pot_limit',
      }),
    ).toBeNull()
  })

  it('팟 리밋 방에서 2인 재레이즈가 가능하다', () => {
    // 회귀: 2인 판은 pot === currentToCall 이라 "누적 <= 팟" 상한과 최소 레이즈 하한 사이에
    // 통과 가능한 금액이 하나도 없었다.
    const state = roundBetState([accepted('b', 'raise', 100)])
    expect(
      checkBetAmount({
        state,
        userId: 'a',
        action: 'raise',
        amount: 300,
        balance: 10_000,
        baseBet: 100,
        raiseRule: 'pot_limit',
      }),
    ).toBeNull()
    expect(
      checkBetAmount({
        state,
        userId: 'a',
        action: 'raise',
        amount: 301,
        balance: 10_000,
        baseBet: 100,
        raiseRule: 'pot_limit',
      }),
    ).toBe('errors.raiseExceedsPotLimit')
  })

  it('정상 레이즈는 통과', () => {
    const state = roundBetState([accepted('b', 'raise', 100)])
    expect(
      checkBetAmount({
        state,
        userId: 'a',
        action: 'raise',
        amount: 200,
        balance: 1000,
        baseBet: 10,
        raiseRule: 'free',
      }),
    ).toBeNull()
  })
})
