'use client'

import { clsx } from 'clsx'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { HwatuCard } from '@/features/hwatu/types'
import { evaluateSeotdaHand } from '@/features/seotda/engine'
import type { SeotdaCategory } from '@/features/seotda/types'
import { format, useDict } from '@/lib/i18n/client'
import { SEOTDA_RANK_TABLE, type SeotdaRankDetail } from './seotda-rank-table'

function detailText(
  detail: SeotdaRankDetail,
  d: ReturnType<typeof useDict>['d'],
  category: SeotdaCategory,
): string {
  const text =
    detail.kind === 'gwang'
      ? format(d.advisor.ranking.detailGwang, { a: detail.months[0], b: detail.months[1] })
      : detail.kind === 'pair'
        ? format(d.advisor.ranking.detailPair, { month: detail.month })
        : format(d.advisor.ranking.detailMonths, { a: detail.months[0], b: detail.months[1] })

  return category === 'kkeut' ? format(d.advisor.ranking.detailExamplePrefix, { detail: text }) : text
}

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
          <div className="grid max-h-72 grid-cols-2 gap-x-2 gap-y-0.5 overflow-y-auto pr-1 sm:grid-cols-3 lg:max-h-none lg:grid-cols-2 lg:overflow-visible lg:pr-0 xl:grid-cols-3">
            {SEOTDA_RANK_TABLE.map((tier, index) => {
              const isActive = tier.rank === currentRank
              const previous = SEOTDA_RANK_TABLE[index - 1]
              const showHeader = index === 0 || previous?.category !== tier.category
              return (
                <Fragment key={tier.rank}>
                  {showHeader ? (
                    <p
                      key={`${tier.category}-header`}
                      className={clsx(
                        'col-span-full px-1 pb-1 text-[11px] font-bold text-muted/70',
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
                      'flex min-h-8 flex-col justify-center rounded-lg px-2 py-1 text-xs',
                      isActive ? 'bg-accent/25 font-bold text-accent' : 'text-text/80',
                    )}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span>{tier.label}</span>
                      {isActive ? (
                        <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {d.advisor.ranking.current}
                        </span>
                      ) : null}
                    </div>
                    <span className="text-[10px] font-normal text-muted/70">
                      {detailText(tier.detail, d, tier.category)}
                    </span>
                  </div>
                </Fragment>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}