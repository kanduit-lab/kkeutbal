import { describe, expect, it } from 'vitest'
import { gostopEffectiveScore, initialGostopScore } from './gostop-score-form'

describe('gostopEffectiveScore', () => {
  it('applies the standard 1-go and 2-go flat bonuses before multipliers', () => {
    expect(gostopEffectiveScore({ ...initialGostopScore, base: 3, goCount: 1 })).toBe(4)
    expect(gostopEffectiveScore({ ...initialGostopScore, base: 3, goCount: 2 })).toBe(5)
  })

  it('doubles from 3-go onward and compounds shake and bomb declarations', () => {
    expect(
      gostopEffectiveScore({
        ...initialGostopScore,
        base: 3,
        goCount: 3,
        shakeCount: 1,
        bombCount: 1,
      }),
    ).toBe((3 + 2) * 2 * 2 * 2)
  })
})