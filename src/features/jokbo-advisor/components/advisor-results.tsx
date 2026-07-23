'use client'

import { useMemo, useState } from 'react'
import type { HwatuCard } from '@/features/hwatu/types'
import { evaluateSeotdaHand, describeSeotdaHand } from '@/features/seotda/engine'
import { GOSTOP_RULES_STANDARD } from '@/features/gostop/types'
import { captureOf, hasChongtong, scoreGostop } from '@/features/gostop/scoring'
import type { PokerCard } from '@/features/poker/cards'
import { describePokerHand, evaluatePokerHand } from '@/features/poker/engine'
import type { SeotdaAdviceCode } from '@/features/seotda/advice'
import { Panel, Stepper } from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'
import { POKER_CATEGORY_STATS, seotdaStats } from '../stats'

/** 어드바이저 판정 결과 패널 3종 — 게임별 표시만 담당하고 선택 상태는 advisor-client 가 소유한다. */

export function SeotdaResult({ cards }: { cards: readonly HwatuCard[] }) {
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
    <Panel className="min-h-36 space-y-3 text-center">
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
                {format(d.advisor.winRateLabel, { rate: `${(result.stats.winRate * 100).toFixed(1)}%` })}
              </span>
              <span className="text-muted">
                {result.stats.replayRate > 0
                  ? `${format(d.advisor.replayRateLabel, { rate: `${(result.stats.replayRate * 100).toFixed(1)}%` })} · `
                  : ''}
                {format(d.advisor.loseRateLabel, { rate: `${(result.stats.loseRate * 100).toFixed(1)}%` })}
              </span>
            </div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-bg-deep/70">
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
    </Panel>
  )
}

/**
 * 패별 상황 안내 — 무엇에 잡히고 무엇을 잡는지. 코드는 엔진(seotda/advice.ts)이 판정하고
 * 문장은 사전이 갖는다. `{rate}` 는 잡는 패가 상대에게 나올 확률로 채운다.
 */
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

export function GostopResult({ cards }: { cards: readonly HwatuCard[] }) {
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
    <Panel className="space-y-4">
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
        <CountStepper
          label={d.advisor.bombCountLabel}
          value={bombCount}
          onChange={setBombCount}
        />
      </div>
    </Panel>
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

  const stats = result ? POKER_CATEGORY_STATS[result.category] : null

  return (
    <Panel className="min-h-36 space-y-3 text-center">
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
      ) : (
        <p className="pt-9 text-sm text-muted">
          {cards.length < 5
            ? format(d.advisor.pokerMoreCards, { n: 5 - cards.length })
            : d.advisor.invalidCombination}
        </p>
      )}
    </Panel>
  )
}

function formatProbability(percent: number): string {
  if (percent >= 1) return `${percent.toFixed(1)}%`
  if (percent >= 0.01) return `${percent.toFixed(2)}%`
  return `${percent.toFixed(4)}%`
}

/**
 * 고/흔들기/폭탄 횟수 — 0~9 카운터. 공용 Stepper(±버튼 48px)를 그대로 써서 터치 타깃을
 * 지킨다 — 예전에는 자체 32px 버튼을 3열 그리드에 욱여넣었지만, 그 폭에서는 48px 버튼
 * 두 개가 물리적으로 들어가지 않아 세로 1열로 쌓는다.
 */
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
