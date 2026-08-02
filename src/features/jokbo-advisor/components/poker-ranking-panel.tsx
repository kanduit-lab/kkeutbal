'use client'

import { clsx } from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PokerCard } from '@/features/poker/cards'
import { evaluatePokerHand } from '@/features/poker/engine'
import { Badge, Button, Panel, ScrollPane, Sheet, useIsDesktop } from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'
import { useRankContextWindow } from './rank-context'
import { POKER_RANK_TABLE, type PokerRankTier } from './poker-rank-table'

/** 한 줄 높이(px) — `min-h-14`(56) + `space-y-1.5`(6) */
const ROW_H = 62

export function PokerRankingPanel({ cards }: { cards: readonly PokerCard[] }) {
  const { d } = useDict()
  const isDesktop = useIsDesktop()
  const [expanded, setExpanded] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [caveatsOpen, setCaveatsOpen] = useState(false)
  const fullListActiveRowRef = useRef<HTMLDivElement | null>(null)

  const currentRank = useMemo(() => {
    if (cards.length === 0) return null
    try {
      const evaluated =
        cards.length < 5
          ? null
          : POKER_RANK_TABLE.find((tier) => tier.category === evaluatePokerHand(cards).category)
      return evaluated?.rank ?? null
    } catch {
      return null
    }
  }, [cards])

  const currentIndex = useMemo(
    () => (currentRank === null ? null : POKER_RANK_TABLE.findIndex((tier) => tier.rank === currentRank)),
    [currentRank],
  )
  const currentTier = currentIndex === null || currentIndex < 0 ? null : POKER_RANK_TABLE[currentIndex]

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
    items: POKER_RANK_TABLE,
    currentIndex: currentTier ? currentIndex : null,
    rowHeight: ROW_H,
    minRows: 3,
  })

  function renderRow(tier: PokerRankTier, index: number, ref?: React.Ref<HTMLDivElement>) {
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
        <div className="flex items-center gap-1.5">
          {/* 줄마다 순위 번호를 둔다 — 목록을 스크롤할 때 헤더의 "N위"는 화면 밖으로 나간다. */}
          <span
            className={clsx(
              'shrink-0 tabular-nums text-micro font-bold',
              isActive ? 'text-accent' : 'text-muted/60',
            )}
          >
            {format(d.advisor.pokerRanking.positionBadge, { position: index + 1 })}
          </span>
          <span className={clsx('truncate text-sm font-bold', isActive && 'text-accent')}>
            {tier.label}
          </span>
          {isActive ? (
            <span className="ms-auto shrink-0">
              <Badge tone="accent">{d.advisor.pokerRanking.current}</Badge>
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted/70">
          {d.advisor.pokerRanking.description[tier.descriptionKey]}
        </p>
      </div>
    )
  }

  function renderFullList() {
    return POKER_RANK_TABLE.map((tier, index) =>
      renderRow(tier, index, tier.rank === currentRank ? fullListActiveRowRef : undefined),
    )
  }

  const caveats = (
    <ul className="space-y-2">
      {(['bestFive', 'wheel', 'kicker', 'suit'] as const).map((key) => {
        const caveat = d.advisor.pokerRanking.caveats[key]
        return (
          <li key={key} className="rounded-xl bg-white/5 px-3 py-2.5">
            <p className="text-sm font-bold">{caveat.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {caveat.body.replaceAll('**', '')}
            </p>
          </li>
        )
      })}
    </ul>
  )

  return (
    <Panel className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-muted">{d.advisor.pokerRanking.title}</p>
          <p className="truncate text-xs text-muted/80">
            {currentTier
              ? format(d.advisor.pokerRanking.currentPosition, {
                  label: currentTier.label,
                  position: (currentIndex ?? 0) + 1,
                  total: POKER_RANK_TABLE.length,
                })
              : d.advisor.pokerRanking.noSelectionHint}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            aria-expanded={caveatsOpen}
            onClick={() => setCaveatsOpen((current) => !current)}
          >
            {caveatsOpen
              ? d.advisor.pokerRanking.caveatsToggleHide
              : d.advisor.pokerRanking.caveatsToggleShow}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => (isDesktop ? setExpanded((current) => !current) : setSheetOpen(true))}
          >
            {isDesktop && expanded
              ? d.advisor.pokerRanking.collapse
              : d.advisor.pokerRanking.viewAll}
          </Button>
        </div>
      </div>

      {caveatsOpen ? (
        <ScrollPane label={d.advisor.pokerRanking.caveatsTitle} className="pe-1">
          {caveats}
        </ScrollPane>
      ) : isDesktop && expanded ? (
        <ScrollPane label={d.advisor.pokerRanking.fullListAria} className="space-y-1.5">
          {renderFullList()}
        </ScrollPane>
      ) : (
        <>
          {aboveCount > 0 ? (
            <p className="shrink-0 text-center text-xs text-muted/60">
              {format(d.advisor.pokerRanking.moreAbove, { n: aboveCount })}
            </p>
          ) : null}
          <div ref={areaRef} className="min-h-0 flex-1 overflow-hidden">
            <div className="space-y-1.5">
              {rows.map((tier) => renderRow(tier, POKER_RANK_TABLE.indexOf(tier)))}
            </div>
          </div>
          {belowCount > 0 ? (
            <p className="shrink-0 text-center text-xs text-muted/60">
              {format(d.advisor.pokerRanking.moreBelow, { n: belowCount })}
            </p>
          ) : null}
        </>
      )}

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        ariaLabel={d.advisor.pokerRanking.fullListAria}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-bold">{d.advisor.pokerRanking.title}</p>
          <Button size="sm" variant="ghost" onClick={() => setSheetOpen(false)}>
            {d.common.close}
          </Button>
        </div>
        <div className="space-y-1.5">{renderFullList()}</div>
      </Sheet>
    </Panel>
  )
}
