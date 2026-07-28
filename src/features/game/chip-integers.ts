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