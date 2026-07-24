/**
 * 브라우저·Server Action 경계에서 직렬화 가능한 세션 칩 정수의 최대값.
 * PostgreSQL bigint 집계는 이 모듈을 통과한 뒤에만 number로 바꾼다.
 */
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

export function addSafeChipIntegers(left: number, right: number, label: string): number {
  return toSafeChipInteger(left + right, label)
}

export function subtractSafeChipIntegers(left: number, right: number, label: string): number {
  return toSafeChipInteger(left - right, label)
}
