'use client'

import { useMemo } from 'react'
import type { HwatuCard } from '@/features/hwatu/types'
import { evaluateSeotdaHand, describeSeotdaHand } from '@/features/seotda/engine'
import type { SeotdaAdviceCode } from '@/features/seotda/advice'
import type { ReactNode } from 'react'
import { Badge, Panel } from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'
import { seotdaStats } from '../stats'

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
    if (cards.length !== 2) return null
    try {
      const hand = evaluateSeotdaHand([cards[0] as HwatuCard, cards[1] as HwatuCard])
      return { hand, description: describeSeotdaHand(hand), stats: seotdaStats(hand) }
    } catch {
      return null
    }
  }, [cards])

  return (
    <ResultRegion className="space-y-3 text-center" vision={vision}>
      {result ? (
        <>
          <p className="font-brush gilt text-6xl font-black">{result.hand.label}</p>
          <p className="text-sm text-muted">{result.description}</p>
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
          {cards.length < 2 ? d.advisor.selectTwoCards : d.advisor.invalidCombination}
        </p>
      )}
    </ResultRegion>
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
