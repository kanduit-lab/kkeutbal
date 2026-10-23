'use client'

const CHIP_COLORS: readonly { value: number; bg: string; rim: string }[] = [
  { value: 500, bg: '#c9962f', rim: '#f3d98a' },
  { value: 100, bg: '#9b2a24', rim: '#e0776f' },
  { value: 25, bg: '#1f6b4a', rim: '#6fc39a' },
  { value: 5, bg: '#1d1a17', rim: '#7a6f64' },
  { value: 1, bg: '#fbf3e3', rim: '#c9b98f' },
]

export function chipBreakdown(
  amount: number,
  maxChips = 5,
): readonly { bg: string; rim: string }[] {
  const chips: { bg: string; rim: string }[] = []
  let rest = Math.max(0, amount)
  for (const denom of CHIP_COLORS) {
    while (rest >= denom.value && chips.length < maxChips) {
      chips.push({ bg: denom.bg, rim: denom.rim })
      rest -= denom.value
    }
    if (chips.length >= maxChips) break
  }
  if (chips.length === 0 && amount > 0) chips.push(CHIP_COLORS[4]!)
  return chips
}

export function ChipStack({ amount, size = 16 }: { amount: number; size?: number }) {
  const chips = chipBreakdown(amount)
  if (chips.length === 0) return null
  return (
    <span
      className="relative inline-block shrink-0"
      style={{ width: size, height: size + (chips.length - 1) * (size * 0.28) }}
      aria-hidden
    >
      {chips.map((chip, i) => (
        <span
          key={i}
          className="absolute rounded-full border-2 border-dashed"
          style={{
            width: size,
            height: size,
            left: 0,
            bottom: i * (size * 0.28),
            backgroundColor: chip.bg,
            borderColor: chip.rim,
            boxShadow: '0 1px 1px rgb(0 0 0 / 0.4)',
          }}
        />
      ))}
    </span>
  )
}