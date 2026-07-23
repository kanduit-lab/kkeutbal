import { clsx } from 'clsx'
import { findPokerCard } from '@/features/poker/cards'

const RED_SUITS: ReadonlySet<string> = new Set(['h', 'd'])

/** 포커 예시 카드 한 장 — 무늬 색상(♥♦ 빨강 / ♠♣ 검정)을 반영한 텍스트 칩. */
export function PokerCardChip({ id }: { id: string }) {
  const card = findPokerCard(id)
  if (!card) throw new Error(`가이드 포커 카드 id 오류: ${id}`)
  const isRed = RED_SUITS.has(card.suit)

  return (
    <span
      className={clsx(
        'bg-card inline-flex min-w-11 items-center justify-center rounded-md border border-black/10 px-2 py-1.5 text-base leading-none font-black',
        isRed ? 'text-accent' : 'text-black',
      )}
    >
      {card.label}
    </span>
  )
}
