'use client'

import { clsx } from 'clsx'
import { useMemo } from 'react'
import { HwatuCardView } from '@/components/hwatu-card'
import { deckFor } from '@/features/hwatu/cards'
import type { CardId, GameType, HwatuCard } from '@/features/hwatu/types'

export function CardPicker({
  gameType,
  selected,
  maxSelect,
  onToggle,
}: {
  gameType: GameType
  selected: ReadonlySet<CardId>
  maxSelect: number
  onToggle: (id: CardId) => void
}) {
  const deck = deckFor(gameType)

  const byMonth = useMemo(() => {
    const groups = new Map<number, HwatuCard[]>()
    for (const card of deck) {
      const list = groups.get(card.month) ?? []
      list.push(card)
      groups.set(card.month, list)
    }
    return [...groups.entries()].sort((a, b) => a[0] - b[0])
  }, [deck])

  const renderCard = (card: HwatuCard) => {
    const isSelected = selected.has(card.id)
    const isFull = !isSelected && selected.size >= maxSelect
    return (
      <button
        key={card.id}
        type="button"
        disabled={isFull}
        onClick={() => onToggle(card.id)}
        className={clsx(
          'flex w-full justify-center rounded-md transition-opacity',
          isFull && 'opacity-30',
        )}
      >
        <HwatuCardView card={card} size="sm" selected={isSelected} />
      </button>
    )
  }

  // 섯다 20장은 한 화면에 다 보이게 플랫 그리드
  if (gameType === 'seotda') {
    return <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">{deck.map(renderCard)}</div>
  }

  return (
    <div className="space-y-3">
      {byMonth.map(([month, cards]) => (
        <div key={month} className="flex items-center gap-2">
          <span className="w-6 shrink-0 text-center text-xs font-bold text-muted">{month}월</span>
          <div className="grid flex-1 grid-cols-4 gap-2">{cards.map(renderCard)}</div>
        </div>
      ))}
    </div>
  )
}
