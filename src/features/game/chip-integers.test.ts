import { describe, expect, it } from 'vitest'
import {
  MAX_SAFE_CHIP_INTEGER,
  addSafeChipIntegers,
  multiplySafeChipIntegers,
  subtractSafeChipIntegers,
  toSafeChipInteger,
} from './chip-integers'

describe('session chip integer boundary', () => {
  it('accepts the exact JavaScript safe-integer endpoints from bigint aggregate text', () => {
    expect(toSafeChipInteger(String(MAX_SAFE_CHIP_INTEGER), 'chip total')).toBe(
      MAX_SAFE_CHIP_INTEGER,
    )
    expect(toSafeChipInteger(String(-MAX_SAFE_CHIP_INTEGER), 'chip total')).toBe(
      -MAX_SAFE_CHIP_INTEGER,
    )
  })

  it.each([['9007199254740992'], ['1.5'], ['not-a-number'], [Number.MAX_VALUE]])(
    'rejects an unsafe or non-integer aggregate: %s',
    (value) => {
      expect(() => toSafeChipInteger(value, 'chip total')).toThrow(/safe integer/)
    },
  )

  it('rejects unsafe arithmetic before a value reaches an action response', () => {
    expect(() => addSafeChipIntegers(MAX_SAFE_CHIP_INTEGER, 1, 'net')).toThrow(/safe integer/)
    expect(() => subtractSafeChipIntegers(-MAX_SAFE_CHIP_INTEGER, 1, 'net')).toThrow(/safe integer/)
  })

  it('rejects an operand that already lost precision, not just an unsafe result', () => {
    // 2**53 + (-1) lands back on 2**53 - 1, so checking only the result lets an
    // already-corrupted left operand through untouched.
    expect(() => addSafeChipIntegers(MAX_SAFE_CHIP_INTEGER + 1, -1, 'net')).toThrow(/safe integer/)
    expect(() => subtractSafeChipIntegers(MAX_SAFE_CHIP_INTEGER + 1, 1, 'net')).toThrow(
      /safe integer/,
    )
    expect(() => multiplySafeChipIntegers(MAX_SAFE_CHIP_INTEGER + 1, 0, 'owed')).toThrow(
      /safe integer/,
    )
  })

  it('multiplies within range and rejects a product that overflows', () => {
    expect(multiplySafeChipIntegers(999, 10, 'owed')).toBe(9990)
    expect(() => multiplySafeChipIntegers(MAX_SAFE_CHIP_INTEGER, 2, 'owed')).toThrow(/safe integer/)
  })
})