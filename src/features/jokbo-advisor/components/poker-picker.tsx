'use client'

import { clsx } from 'clsx'
import { useMemo } from 'react'
import { isRedPokerSuit, PokerCardView } from '@/components/poker-card'
import { useToast } from '@/components/ui'
import { POKER_DECK, SUIT_LABELS } from '@/features/poker/cards'
import type { PokerCard, PokerSuit } from '@/features/poker/cards'
import { format, useDict } from '@/lib/i18n/client'

const SUIT_ORDER: readonly PokerSuit[] = ['s', 'h', 'd', 'c']

/** HwatuCardView 와 톤을 맞춘 트럼프 카드 타일 그리드 — 카드 얼굴 렌더링은 PokerCardView 에 위임한다. */
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
          {/* auto-fill + minmax(48px,…) — 화면 폭에 맞춰 열 수를 자동 조절하면서 터치 타겟은 항상 48px 이상 유지 */}
          <div className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(48px,1fr))] gap-1.5">
            {cards.map((card) => {
              const isSelected = selected.has(card.id)
              const isFull = !isSelected && selected.size >= maxSelect
              return (
                // 상한 도달 카드는 aria-disabled + 사유 토스트 — 화투 피커와 같은 규칙이다.
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
