'use client'

import { clsx } from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PokerCard } from '@/features/poker/cards'
import { evaluatePokerHand } from '@/features/poker/engine'
import { useDict } from '@/lib/i18n/client'
import { POKER_RANK_TABLE } from './poker-rank-table'

export function PokerRankingPanel({ cards }: { cards: readonly PokerCard[] }) {
  const { d } = useDict()
  const [open, setOpen] = useState(false)
  const activeRowRef = useRef<HTMLDivElement | null>(null)

  const currentRank = useMemo(() => {
    if (cards.length === 0) return null
    try {
      const evaluated =
        cards.length < 5
          ? null
          : POKER_RANK_TABLE.find(
              (tier) => tier.category === evaluatePokerHand(cards).category,
            )
      return evaluated?.rank ?? null
    } catch {
      return null
    }
  }, [cards])

  useEffect(() => {
    if (currentRank === null) return
    const reduceMotion =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const frame = window.requestAnimationFrame(() => {
      activeRowRef.current?.scrollIntoView({
        block: 'nearest',
        behavior: reduceMotion ? 'auto' : 'smooth',
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [currentRank, open])

  return (
    <div>
      <button
        type="button"
        className="flex min-h-12 w-full items-center justify-between rounded-xl bg-white/5 px-3 text-sm font-bold text-muted lg:hidden"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? d.advisor.pokerRanking.hide : d.advisor.pokerRanking.show}
        <span aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      <div className={clsx(open ? 'mt-2 block' : 'hidden', 'lg:mt-0 lg:block')}>
        <div className="rounded-xl bg-white/5 p-2">
          <p className="hidden px-1 pb-1.5 text-sm font-bold text-muted lg:block">
            {d.advisor.pokerRanking.title}
          </p>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
            {POKER_RANK_TABLE.map((tier) => {
              const isActive = tier.rank === currentRank
              return (
                <div
                  key={tier.rank}
                  ref={isActive ? activeRowRef : undefined}
                  aria-current={isActive ? 'true' : undefined}
                  className={clsx(
                    'flex min-h-8 items-center justify-between rounded-lg px-2 py-1 text-xs',
                    isActive ? 'bg-accent/25 font-bold text-accent' : 'text-text/80',
                  )}
                >
                  <span>{tier.label}</span>
                  {isActive ? (
                    <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {d.advisor.pokerRanking.current}
                    </span>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
