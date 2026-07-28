'use client'

import { clsx } from 'clsx'
import { useMemo } from 'react'
import { isRedPokerSuit, PokerCardView } from '@/components/poker-card'
import { useToast } from '@/components/ui'
import { POKER_DECK, SUIT_LABELS } from '@/features/poker/cards'
import type { PokerCard, PokerSuit } from '@/features/poker/cards'
import { format, useDict } from '@/lib/i18n/client'

const SUIT_ORDER: readonly PokerSuit[] = ['s', 'h', 'd', 'c']

export function PokerPicker({
  selected,
  maxSelect,
  onToggle,
}: {
  selected: ReadonlySet<string>
  maxSelect: number
  onToggle: (id: string) => void
}) {
  const { d } = useDict()
  const { toast } = useToast()
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
              isRedPokerSuit(suit) ? 'text-accent' : 'text-text',
            )}
          >
            {SUIT_LABELS[suit]}
          </span>
          <div className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(48px,1fr))] gap-1.5">
            {cards.map((card) => {
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
                  className={clsx('flex justify-center rounded-md', isFull && 'cursor-not-allowed')}
                >
                  <PokerCardView card={card} size="xs" selected={isSelected} disabled={isFull} />
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}