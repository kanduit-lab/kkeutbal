'use client'

import { useMemo, useState } from 'react'
import type { HwatuCard } from '@/features/hwatu/types'
import { evaluateSeotdaHand, describeSeotdaHand } from '@/features/seotda/engine'
import { GOSTOP_RULES_STANDARD } from '@/features/gostop/types'
import { captureOf, hasChongtong, scoreGostop } from '@/features/gostop/scoring'
import type { PokerCard } from '@/features/poker/cards'
import { describePokerHand, evaluatePokerHand, POKER_CATEGORY_LABEL } from '@/features/poker/engine'
import type { SeotdaAdviceCode } from '@/features/seotda/advice'
import type { ReactNode } from 'react'
import { Badge, Panel, Stepper } from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'
import { previewPokerHand, type PokerHandPreview } from '../poker-preview'
import { POKER_CATEGORY_STATS, seotdaStats } from '../stats'

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
    <ResultRegion className="min-h-36 space-y-3 text-center" vision={vision}>
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
        <p className="pt-9 text-sm text-muted">
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

export function GostopResult({
  cards,
  vision,
}: {
  cards: readonly HwatuCard[]
  vision?: VisionSource | null
}) {
  const { d } = useDict()
  const [goCount, setGoCount] = useState(0)
  const [shakeCount, setShakeCount] = useState(0)
  const [bombCount, setBombCount] = useState(0)

  const result = useMemo(() => {
    if (cards.length === 0) return null
    try {
      const capture = captureOf(cards, GOSTOP_RULES_STANDARD)
      const score = scoreGostop(
        capture,
        { goCount, shakeCount, bombCount, opponents: [] },
        GOSTOP_RULES_STANDARD,
      )
      return { capture, score, chongtong: hasChongtong(cards) }
    } catch {
      return null
    }
  }, [cards, goCount, shakeCount, bombCount])

  return (
    <ResultRegion className="space-y-4" vision={vision}>
      {result ? (
        <>
          <div className="text-center">
            <p className="text-5xl font-black text-warn">
              {format(d.advisor.gostopScorePoints, { n: result.score.total })}
            </p>
            <p className="mt-1 text-xs text-muted">
              {format(d.advisor.gostopCaptureLine, {
                gwang: result.capture.gwang.length,
                yeol: result.capture.yeol.length,
                tti: result.capture.tti.length,
                pi: result.capture.piValue,
              })}
              {result.chongtong ? d.advisor.chongtongSuffix : ''}
              {result.score.canStop ? d.advisor.canStopSuffix : ''}
            </p>
          </div>
          {result.score.breakdown.length > 0 ? (
            <ul className="space-y-0.5 text-sm">
              {result.score.breakdown.map((line) => (
                <li key={line.source} className="flex justify-between">
                  <span className="text-muted">{line.source}</span>
                  <span className="tabular-nums font-bold">+{line.points}</span>
                </li>
              ))}
              {result.score.multipliers.map((multiplier) => (
                <li key={multiplier.source} className="flex justify-between text-warn">
                  <span>{multiplier.source}</span>
                  <span className="tabular-nums font-bold">×{multiplier.factor}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-center text-sm text-muted">{d.advisor.noScoreYet}</p>
          )}
        </>
      ) : (
        <p className="py-7 text-center text-sm text-muted">{d.advisor.selectCapturedCards}</p>
      )}

      <div className="space-y-2">
        <CountStepper label={d.advisor.goCountLabel} value={goCount} onChange={setGoCount} />
        <CountStepper
          label={d.advisor.shakeCountLabel}
          value={shakeCount}
          onChange={setShakeCount}
        />
        <CountStepper label={d.advisor.bombCountLabel} value={bombCount} onChange={setBombCount} />
      </div>
    </ResultRegion>
  )
}

export function PokerResult({ cards }: { cards: readonly PokerCard[] }) {
  const { d } = useDict()
  const result = useMemo(() => {
    if (cards.length < 5) return null
    try {
      return evaluatePokerHand(cards)
    } catch {
      return null
    }
  }, [cards])

  const preview = useMemo(
    () => (cards.length >= 3 && cards.length < 5 ? previewPokerHand(cards) : null),
    [cards],
  )

  const stats = result ? POKER_CATEGORY_STATS[result.category] : null

  return (
    <ResultRegion className="min-h-36 space-y-3 text-center">
      {result && stats ? (
        <>
          <p className="font-brush gilt text-5xl font-black">{result.label}</p>
          <p className="text-sm text-muted">{describePokerHand(result)}</p>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-bold">
            <span className="rounded-full bg-accent/20 px-2.5 py-1 text-accent">
              {format(d.advisor.pokerRankPosition, { position: stats.position })}
            </span>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-muted">
              {format(d.advisor.pokerProbability, {
                probability: formatProbability(stats.probability),
              })}
            </span>
          </div>
        </>
      ) : preview?.computed ? (
        <PokerPreviewList preview={preview} />
      ) : (
        <p className="pt-9 text-sm text-muted">
          {cards.length >= 5
            ? d.advisor.invalidCombination
            : preview && !preview.computed && preview.reason === 'tooManyCombinations'
              ? d.advisor.pokerPreviewUnavailable
              : format(d.advisor.pokerMoreCards, { n: 5 - cards.length })}
        </p>
      )}
    </ResultRegion>
  )
}

function PokerPreviewList({
  preview,
}: {
  preview: Extract<PokerHandPreview, { computed: true }>
}) {
  const { d } = useDict()
  const completable = preview.categories.filter((entry) => entry.probability > 0)
  return (
    <div className="space-y-2 text-left">
      <p className="text-center text-xs text-muted">
        {format(d.advisor.pokerPreviewIntro, { n: preview.totalCombinations })}
      </p>
      <ul className="space-y-1">
        {completable.map((entry) => (
          <li
            key={entry.category}
            className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-1.5 text-xs"
          >
            <span className="font-bold">{POKER_CATEGORY_LABEL[entry.category]}</span>
            <span className="tabular-nums text-muted">
              {formatProbability(entry.probability * 100)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function formatProbability(percent: number): string {
  if (percent >= 1) return `${percent.toFixed(1)}%`
  if (percent >= 0.01) return `${percent.toFixed(2)}%`
  return `${percent.toFixed(4)}%`
}

function CountStepper({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (next: number) => void
}) {
  const { d } = useDict()
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-bg px-3 py-2">
      <span className="text-xs font-medium text-muted">{label}</span>
      <Stepper
        value={value}
        onChange={onChange}
        min={0}
        max={9}
        ariaLabel={label}
        decreaseLabel={format(d.advisor.countDecreaseAria, { label })}
        increaseLabel={format(d.advisor.countIncreaseAria, { label })}
      />
    </div>
  )
}
