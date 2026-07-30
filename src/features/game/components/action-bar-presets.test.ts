import { describe, expect, it } from 'vitest'
import { buildRaisePresetOptions } from './action-bar-presets'

describe('buildRaisePresetOptions', () => {
  it('lastBet 이하인 후보는 버리고, 남은 금액에서 이미 낸 금액을 뺀다', () => {
    const options = buildRaisePresetOptions(
      'seotda',
      { lastBet: 100, pot: 450, base: 50, contribution: 0, minRaise: 101, balance: 0 },
      '올인',
    )
    // seotda raw presets: [50(삥), 200(따당), 225(하프), 450(풀)] — 100보다 큰 것만: 200,225,450
    // 그 중 minRaise(101) 이상만: 전부 통과
    expect(options.map((o) => o.amount)).toEqual([200, 225, 450])
  })

  it('이미 낸 금액(contribution)만큼 빼서 추가로 내야 할 금액으로 바꾼다', () => {
    const options = buildRaisePresetOptions(
      'seotda',
      { lastBet: 100, pot: 450, base: 50, contribution: 100, minRaise: 1, balance: 0 },
      '올인',
    )
    // 200-100, 225-100, 450-100
    expect(options.map((o) => o.amount)).toEqual([100, 125, 350])
  })

  it('minRaise 미만인 후보는 버린다', () => {
    const options = buildRaisePresetOptions(
      'seotda',
      { lastBet: 100, pot: 450, base: 50, contribution: 100, minRaise: 200, balance: 0 },
      '올인',
    )
    // 위 예시에서 100,125는 200 미만이라 버려지고 350만 남는다
    expect(options.map((o) => o.amount)).toEqual([350])
  })

  it('잔액이 남아있으면 올인 옵션을 끝에 추가한다', () => {
    const options = buildRaisePresetOptions(
      'seotda',
      { lastBet: 100, pot: 450, base: 50, contribution: 0, minRaise: 101, balance: 900 },
      '올인',
    )
    expect(options.at(-1)).toEqual({ label: '올인', amount: 900 })
  })

  it('잔액이 0이면 올인 옵션을 추가하지 않는다', () => {
    const options = buildRaisePresetOptions(
      'seotda',
      { lastBet: 100, pot: 450, base: 50, contribution: 0, minRaise: 101, balance: 0 },
      '올인',
    )
    expect(options.some((o) => o.label === '올인')).toBe(false)
  })

  it('포커는 seotda와 다른 프리셋 라벨 집합을 쓴다(더블/하프/팟, 삥/따당 없음)', () => {
    const options = buildRaisePresetOptions(
      'poker',
      { lastBet: 100, pot: 450, base: 50, contribution: 0, minRaise: 1, balance: 0 },
      '올인',
    )
    expect(options.map((o) => o.amount)).toEqual([200, 225, 450])
  })

  it('첫 베팅 전(lastBet=0)이면 base 프리셋도 후보에 남는다(0보다 크므로)', () => {
    const options = buildRaisePresetOptions(
      'seotda',
      { lastBet: 0, pot: 0, base: 50, contribution: 0, minRaise: 50, balance: 0 },
      '올인',
    )
    expect(options.map((o) => o.amount)).toEqual([50])
  })
})
