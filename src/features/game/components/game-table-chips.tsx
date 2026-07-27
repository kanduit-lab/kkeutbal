'use client'

/**
 * 테이블의 칩 시각화 — 액면가 색 배분과 좌석 옆 칩 더미.
 * 좌석 배치·차례 힌트와 아무 상태도 공유하지 않아서 game-table 에서 떼어 냈다.
 */

/** 칩 액면가 → 색. 실물 카지노 칩 관례를 따른다. */
const CHIP_COLORS: readonly { value: number; bg: string; rim: string }[] = [
  { value: 500, bg: '#7c3aed', rim: '#a78bfa' },
  { value: 100, bg: '#18181b', rim: '#52525b' },
  { value: 25, bg: '#15803d', rim: '#4ade80' },
  { value: 5, bg: '#b91c1c', rim: '#f87171' },
  { value: 1, bg: '#e4e4e7', rim: '#a1a1aa' },
]

export function chipBreakdown(
  amount: number,
  maxChips = 5,
): readonly { bg: string; rim: string }[] {
  // 로컬 accumulator — 함수 밖으로 새지 않음
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
