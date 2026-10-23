'use client'

import { clsx } from 'clsx'
import { useId, useMemo } from 'react'
import type { HwatuCard } from '@/features/hwatu/types'
import { describeSeotdaHand } from '@/features/seotda/engine'
import type { SeotdaAdviceCode } from '@/features/seotda/advice'
import type { SeotdaHand } from '@/features/seotda/types'
import type { ReactNode } from 'react'
import { Badge, Panel } from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'
import { seotdaStats } from '../stats'
import { readSeotdaCards } from './seotda-reading'

export interface VisionSource {
  readonly confidence: number
}

function ResultRegion({
  className,
  vision,
  children,
}: {
  className?: string
  vision?: VisionSource | null
  children: ReactNode
}) {
  const { d } = useDict()
  return (
    <div aria-live="polite" aria-atomic="true">
      <Panel className={className}>
        <h2 className="sr-only">{d.advisor.resultHeading}</h2>
        {vision ? (
          <p className="mb-2 flex justify-center">
            <Badge tone={vision.confidence >= 0.9 ? 'muted' : 'warn'}>
              {format(d.advisor.vision.sourceBadge, {
                confidence: (vision.confidence * 100).toFixed(0),
              })}
            </Badge>
          </p>
        ) : null}
        {children}
      </Panel>
    </div>
  )
}

export function SeotdaResult({
  cards,
  vision,
}: {
  cards: readonly HwatuCard[]
  vision?: VisionSource | null
}) {
  const { d } = useDict()
  const result = useMemo(() => {
    const reading = readSeotdaCards(cards)
    if (!reading) return null
    const { hand } = reading
    return { ...reading, description: describeSeotdaHand(hand), stats: seotdaStats(hand) }
  }, [cards])

  return (
    <ResultRegion className="space-y-3 text-center" vision={vision}>
      {result ? (
        <>
          <p className="font-brush gilt text-6xl font-black">{result.hand.label}</p>
          <p className="text-sm text-muted">{result.description}</p>
          {result.pairs ? (
            <SeotdaPairList pairs={result.pairs} bestIndex={result.bestIndex} />
          ) : null}
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-bold">
            <span className="rounded-full bg-accent/20 px-2.5 py-1 text-accent">
              {format(d.advisor.tierPosition, {
                position: result.stats.tierPosition,
                total: result.stats.totalTiers,
              })}
            </span>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-muted">
              {format(d.advisor.sameTierCount, { n: result.stats.sameTierCount })}
            </span>
          </div>
          <div className="space-y-1.5 text-left">
            <div className="flex justify-between text-xs font-medium">
              <span className="text-win">
                {format(d.advisor.winRateLabel, {
                  rate: `${(result.stats.winRate * 100).toFixed(1)}%`,
                })}
              </span>
              <span className="text-muted">
                {result.stats.replayRate > 0
                  ? `${format(d.advisor.replayRateLabel, { rate: `${(result.stats.replayRate * 100).toFixed(1)}%` })} · `
                  : ''}
                {format(d.advisor.loseRateLabel, {
                  rate: `${(result.stats.loseRate * 100).toFixed(1)}%`,
                })}
              </span>
            </div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-field">
              <div className="bg-win" style={{ width: `${result.stats.winRate * 100}%` }} />
              <div className="bg-white/25" style={{ width: `${result.stats.replayRate * 100}%` }} />
              <div className="bg-accent" style={{ width: `${result.stats.loseRate * 100}%` }} />
            </div>
            <p className="text-[11px] text-muted">{d.advisor.remainingCardsFootnote}</p>
          </div>
          <SeotdaAdviceList advice={result.stats.advice} catcherRate={result.stats.catcherRate} />
        </>
      ) : (
        <p className="text-sm text-muted">
          {cards.length < 2 ? d.advisor.selectCards : d.advisor.invalidCombination}
        </p>
      )}
    </ResultRegion>
  )
}

function SeotdaPairList({ pairs, bestIndex }: { pairs: readonly SeotdaHand[]; bestIndex: number }) {
  const { d } = useDict()
  const headingId = useId()
  return (
    <div className="space-y-1.5 text-left">
      <p id={headingId} className="text-xs font-bold text-muted">
        {d.advisor.pairsHeading}
      </p>
      <ul aria-labelledby={headingId} className="space-y-1">
        {pairs.map((pair, index) => {
          const isBest = index === bestIndex
          return (
            <li
              key={`${pair.cards[0].id}-${pair.cards[1].id}`}
              aria-current={isBest ? 'true' : undefined}
              className={clsx(
                'flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs',
                isBest ? 'bg-accent/20 ring-1 ring-inset ring-accent/50' : 'bg-white/5',
              )}
            >
              <span className="min-w-0 truncate text-muted">
                {format(d.advisor.pairCards, { a: pair.cards[0].label, b: pair.cards[1].label })}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {isBest ? <Badge tone="accent">{d.advisor.bestPair}</Badge> : null}
                <span className={clsx('text-sm font-bold', isBest && 'text-accent')}>
                  {pair.label}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function SeotdaAdviceList({
  advice,
  catcherRate,
}: {
  advice: readonly SeotdaAdviceCode[]
  catcherRate: number
}) {
  const { d } = useDict()
  if (advice.length === 0) return null
  const rate = `${(catcherRate * 100).toFixed(1)}%`
  return (
    <ul className="space-y-1.5 text-left">
      {advice.map((code) => (
        <li
          key={code}
          className="rounded-lg bg-white/5 px-3 py-2 text-xs leading-relaxed text-muted"
        >
          {format(d.advisor.advice[code], { rate })}
        </li>
      ))}
    </ul>
  )
}
