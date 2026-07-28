'use client'

import { clsx } from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { HwatuCard } from '@/features/hwatu/types'
import { evaluateSeotdaHand } from '@/features/seotda/engine'
import type { SeotdaCategory } from '@/features/seotda/types'
import { useDict } from '@/lib/i18n/client'
import { SEOTDA_RANK_TABLE } from './seotda-rank-table'

export function SeotdaRankingPanel({ cards }: { cards: readonly HwatuCard[] }) {
  const { d } = useDict()
  const [open, setOpen] = useState(false)
  const activeRowRef = useRef<HTMLDivElement | null>(null)

  const currentRank = useMemo(() => {
    if (cards.length !== 2) return null
    try {
      return evaluateSeotdaHand([cards[0] as HwatuCard, cards[1] as HwatuCard]).rank
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

  const categoryLabel: Readonly<Record<SeotdaCategory, string>> = {
    gwangttaeng: d.advisor.ranking.categoryGwangttaeng,
    ttaeng: d.advisor.ranking.categoryTtaeng,
    special: d.advisor.ranking.categorySpecial,
    kkeut: d.advisor.ranking.categoryKkeut,
  }

  return (
    <div>
      <button
        type="button"
        className="flex min-h-12 w-full items-center justify-between rounded-xl bg-white/5 px-3 text-sm font-bold text-muted lg:hidden"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? d.advisor.ranking.hide : d.advisor.ranking.show}
        <span aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      <div className={clsx(open ? 'mt-2 block' : 'hidden', 'lg:mt-0 lg:block')}>
        <div className="rounded-xl bg-white/5 p-2">
          <p className="hidden px-1 pb-1.5 text-sm font-bold text-muted lg:block">
            {d.advisor.ranking.title}
          </p>
          <div className="max-h-72 space-y-0.5 overflow-y-auto pr-1 lg:max-h-none lg:overflow-visible lg:pr-0">
            {SEOTDA_RANK_TABLE.map((tier, index) => {
              const isActive = tier.rank === currentRank
              const previous = SEOTDA_RANK_TABLE[index - 1]
              const showHeader = index === 0 || previous?.category !== tier.category
              return (
                <div key={tier.rank}>
                  {showHeader ? (
                    <p
                      className={clsx(
                        'px-1 pb-1 text-[11px] font-bold text-muted/70',
                        index === 0 ? 'pt-0' : 'pt-3',
                      )}
                    >
                      {categoryLabel[tier.category]}
                    </p>
                  ) : null}
                  <div
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
                        {d.advisor.ranking.current}
                      </span>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}