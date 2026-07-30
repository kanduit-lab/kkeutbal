'use client'

import { clsx } from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { HwatuCard } from '@/features/hwatu/types'
import { evaluateSeotdaHand } from '@/features/seotda/engine'
import type { SeotdaCategory } from '@/features/seotda/types'
import { Badge, Button, Panel, ScrollPane, Sheet, useIsDesktop } from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'
import { useRankContextWindow } from './rank-context'
import { SEOTDA_RANK_TABLE, type SeotdaRankDetail, type SeotdaRankTier } from './seotda-rank-table'

/** 한 줄 높이(px) — `min-h-14`(56) + `space-y-1.5`(6) */
const ROW_H = 62

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
  const isDesktop = useIsDesktop()
  const [expanded, setExpanded] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const fullListActiveRowRef = useRef<HTMLDivElement | null>(null)

  const categoryLabel: Readonly<Record<SeotdaCategory, string>> = {
    gwangttaeng: d.advisor.ranking.categoryGwangttaeng,
    ttaeng: d.advisor.ranking.categoryTtaeng,
    special: d.advisor.ranking.categorySpecial,
    kkeut: d.advisor.ranking.categoryKkeut,
  }

  const currentRank = useMemo(() => {
    if (cards.length !== 2) return null
    try {
      return evaluateSeotdaHand([cards[0] as HwatuCard, cards[1] as HwatuCard]).rank
    } catch {
      return null
    }
  }, [cards])

  const currentIndex = useMemo(
    () =>
      currentRank === null ? null : SEOTDA_RANK_TABLE.findIndex((tier) => tier.rank === currentRank),
    [currentRank],
  )
  const currentTier = currentIndex === null || currentIndex < 0 ? null : SEOTDA_RANK_TABLE[currentIndex]

  const showingFullList = isDesktop ? expanded : sheetOpen

  useEffect(() => {
    if (!currentTier || !showingFullList) return
    const reduceMotion =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const frame = window.requestAnimationFrame(() => {
      fullListActiveRowRef.current?.scrollIntoView({
        block: 'center',
        behavior: reduceMotion ? 'auto' : 'smooth',
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [currentTier, showingFullList])

  const { areaRef, rows, aboveCount, belowCount } = useRankContextWindow({
    items: SEOTDA_RANK_TABLE,
    currentIndex: currentTier ? currentIndex : null,
    rowHeight: ROW_H,
    minRows: 3,
  })

  function renderRow(tier: SeotdaRankTier, ref?: React.Ref<HTMLDivElement>) {
    const isActive = tier.rank === currentRank
    return (
      <div
        key={tier.rank}
        ref={ref}
        aria-current={isActive ? 'true' : undefined}
        className={clsx(
          'min-h-14 rounded-xl px-3 py-2',
          isActive ? 'bg-accent/20 ring-1 ring-inset ring-accent/50' : 'bg-white/5',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <Badge tone="muted">{categoryLabel[tier.category]}</Badge>
          {isActive ? <Badge tone="accent">{d.advisor.ranking.current}</Badge> : null}
        </div>
        <div className="mt-0.5 flex items-baseline justify-between gap-2">
          <span className={clsx('truncate text-sm font-bold', isActive && 'text-accent')}>
            {tier.label}
          </span>
          <span className="shrink-0 text-xs text-muted/70">
            {detailText(tier.detail, d, tier.category)}
          </span>
        </div>
      </div>
    )
  }

  function renderFullList() {
    return SEOTDA_RANK_TABLE.map((tier) =>
      renderRow(tier, tier.rank === currentRank ? fullListActiveRowRef : undefined),
    )
  }

  return (
    <Panel className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-muted">{d.advisor.ranking.title}</p>
          <p className="truncate text-xs text-muted/80">
            {currentTier
              ? format(d.advisor.ranking.currentPosition, {
                  label: currentTier.label,
                  position: (currentIndex ?? 0) + 1,
                  total: SEOTDA_RANK_TABLE.length,
                })
              : d.advisor.ranking.noSelectionHint}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={() => (isDesktop ? setExpanded((current) => !current) : setSheetOpen(true))}
        >
          {isDesktop && expanded ? d.advisor.ranking.collapse : d.advisor.ranking.viewAll}
        </Button>
      </div>

      {isDesktop && expanded ? (
        <ScrollPane label={d.advisor.ranking.fullListAria} className="space-y-1.5">
          {renderFullList()}
        </ScrollPane>
      ) : (
        <>
          {aboveCount > 0 ? (
            <p className="shrink-0 text-center text-xs text-muted/60">
              {format(d.advisor.ranking.moreAbove, { n: aboveCount })}
            </p>
          ) : null}
          <div ref={areaRef} className="min-h-0 flex-1 overflow-hidden">
            <div className="space-y-1.5">{rows.map((tier) => renderRow(tier))}</div>
          </div>
          {belowCount > 0 ? (
            <p className="shrink-0 text-center text-xs text-muted/60">
              {format(d.advisor.ranking.moreBelow, { n: belowCount })}
            </p>
          ) : null}
        </>
      )}

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        ariaLabel={d.advisor.ranking.fullListAria}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-bold">{d.advisor.ranking.title}</p>
          <Button size="sm" variant="ghost" onClick={() => setSheetOpen(false)}>
            {d.common.close}
          </Button>
        </div>
        <div className="space-y-1.5">{renderFullList()}</div>
      </Sheet>
    </Panel>
  )
}
