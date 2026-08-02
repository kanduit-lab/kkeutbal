export const MAX_SAFE_CHIP_INTEGER = Number.MAX_SAFE_INTEGER

export function toSafeChipInteger(value: unknown, label: string): number {
  const integer =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^-?\d+$/.test(value)
        ? Number(value)
        : Number.NaN
  if (!Number.isSafeInteger(integer)) {
    throw new RangeError(`${label} must be a safe integer, received ${String(value)}`)
  }
  return integer
}

/**
 * 피연산자를 먼저 검사한다. 결과만 보면 이미 정밀도를 잃은 값이 통과한다 —
 * `2**53 + (-1)`은 `2**53 - 1`로 떨어져서 안전 정수 검사를 그대로 지나가지만,
 * 들어온 왼쪽 값은 이미 틀린 값이었다.
 */
export function addSafeChipIntegers(left: number, right: number, label: string): number {
  toSafeChipInteger(left, label)
  toSafeChipInteger(right, label)
  return toSafeChipInteger(left + right, label)
}

export function subtractSafeChipIntegers(left: number, right: number, label: string): number {
  toSafeChipInteger(left, label)
  toSafeChipInteger(right, label)
  return toSafeChipInteger(left - right, label)
}

/** 곱셈도 같은 규약으로 묶는다 — 고스톱 정산의 `점수 × 점당 × 배수`가 이 경로다. */
export function multiplySafeChipIntegers(
  left: number,
  right: number,
  label: string,
): number {
  toSafeChipInteger(left, label)
  toSafeChipInteger(right, label)
  return toSafeChipInteger(left * right, label)
}