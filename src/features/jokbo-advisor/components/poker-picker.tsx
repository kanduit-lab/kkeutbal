'use client'

import { clsx } from 'clsx'
import { useMemo } from 'react'
import { POKER_DECK, SUIT_LABELS } from '@/features/poker/cards'
import type { PokerCard, PokerSuit } from '@/features/poker/cards'

const SUIT_ORDER: readonly PokerSuit[] = ['s', 'h', 'd', 'c']
const RED_SUITS: ReadonlySet<PokerSuit> = new Set(['h', 'd'])

/** HwatuCardView 와 톤을 맞춘 트럼프 카드 타일. 화투 그림이 없어 라벨 텍스트로만 표시한다. */
export function PokerPicker({
  selected,
  maxSelect,
  onToggle,
}: {
  selected: ReadonlySet<string>
  maxSelect: number
  onToggle: (id: string) => void
}) {
  const bySuit = useMemo(() => {
    const groups = new Map<PokerSuit, PokerCard[]>()
    for (const card of POKER_DECK) {
      const list = groups.get(card.suit) ?? []
      list.push(card)
      groups.set(card.suit, list)
    }
    return SUIT_ORDER.map((suit) => [suit, groups.get(suit) ?? []] as const)
  }, [])

  return (
    <div className="mx-auto w-full max-w-md space-y-3">
      {bySuit.map(([suit, cards]) => (
        <div key={suit} className="flex items-start gap-2">
          <span
            className={clsx(
              'w-6 shrink-0 pt-1 text-center text-base font-black',
              RED_SUITS.has(suit) ? 'text-red-500' : 'text-text',
            )}
          >
            {SUIT_LABELS[suit]}
          </span>
          <div className="grid flex-1 grid-cols-7 gap-1.5">
            {cards.map((card) => {
              const isSelected = selected.has(card.id)
              const isFull = !isSelected && selected.size >= maxSelect
              return (
                <button
                  key={card.id}
                  type="button"
                  disabled={isFull}
                  onClick={() => onToggle(card.id)}
                  className={clsx('flex justify-center rounded-md transition-opacity', isFull && 'opacity-30')}
                >
                  <PokerCardTile card={card} selected={isSelected} />
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function PokerCardTile({ card, selected }: { card: PokerCard; selected: boolean }) {
  const red = RED_SUITS.has(card.suit)
  return (
    <div
      className={clsx(
        'flex aspect-[2/3] w-full items-center justify-center rounded-md border-2 border-black/80 bg-[#fbf3e3] text-[11px] font-black shadow-sm',
        red ? 'text-red-600' : 'text-black',
        selected && 'ring-2 ring-accent ring-offset-1 ring-offset-bg',
      )}
    >
      {card.label}
    </div>
  )
}
