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

  /**
   * 상한에 닿아도 진짜 `disabled` 로 두지 않는다 — 섯다는 2장이 상한이라 두 장 고르는 순간
   * 나머지 18장이 전부 무반응이 되는데, 탭해도 아무 일이 없으면 "앱이 멈췄다"로 읽힌다.
   * aria-disabled 로 탭은 살려 두고 사유를 토스트로 알린다 (Button 의 disabledReason 과 같은 규칙).
   */
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

  // 섯다 20장 — 월별로 묶어 2장씩 보여준다. 월 숫자가 곧 끗 계산의 단서라 라벨을 키워
  // 스캔하기 쉽게 두고, 블록 폭은 auto-fill 로 맡겨 화면 폭(모바일 단일열 · 데스크톱
  // 서열표와 나란한 좁은 컬럼)에 상관없이 카드가 항상 터치하기 충분한 크기를 유지한다.
  if (gameType === 'seotda') {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2.5">
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
