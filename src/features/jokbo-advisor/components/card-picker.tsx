'use client'

import { clsx } from 'clsx'
import { useMemo } from 'react'
import { HwatuCardView } from '@/components/hwatu-card'
import { useToast } from '@/components/ui'
import { deckFor } from '@/features/hwatu/cards'
import type { CardId, GameType, HwatuCard } from '@/features/hwatu/types'
import { format, useDict } from '@/lib/i18n/client'

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
  const { d } = useDict()
  const { toast } = useToast()
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
        aria-pressed={isSelected}
        aria-disabled={isFull || undefined}
        aria-label={format(d.advisor.cardToggleAria, { card: card.label })}
        onClick={() => {
          if (isFull) {
            toast(format(d.advisor.pickerFullReason, { max: maxSelect }), 'info')
            return
          }
          onToggle(card.id)
        }}
        className={clsx(
          'flex w-full justify-center rounded-md transition-opacity',
          isFull && 'cursor-not-allowed opacity-30',
        )}
      >
        <HwatuCardView card={card} size="sm" selected={isSelected} />
      </button>
    )
  }

  if (gameType === 'seotda') {
    // 10개월을 자동 채움으로 깔면 폭에 따라 4열이 되어 4·4·2로 떨어지고, 마지막 줄에 빈 칸
    // 두 개와 그 아래 큰 여백이 남는다. 2열(폰) → 5열(데스크톱)로 못박으면 어느 폭에서도
    // 줄이 정확히 나뉜다.
    return (
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {byMonth.map(([month, cards]) => (
          <div
            key={month}
            role="group"
            aria-label={format(d.advisor.monthLabel, { month })}
            className="rounded-xl bg-white/5 p-2"
          >
            <p className="gilt pb-1.5 text-center text-sm font-black">
              {format(d.advisor.monthLabel, { month })}
            </p>
            <div className="grid grid-cols-2 gap-1.5">{cards.map(renderCard)}</div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {byMonth.map(([month, cards]) => (
        <div key={month} className="flex items-center gap-2">
          <span className="w-6 shrink-0 text-center text-xs font-bold text-muted">
            {format(d.advisor.monthLabel, { month })}
          </span>
          <div className="grid flex-1 grid-cols-4 gap-2">{cards.map(renderCard)}</div>
        </div>
      ))}
    </div>
  )
}
