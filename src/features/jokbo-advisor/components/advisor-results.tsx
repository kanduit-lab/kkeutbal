'use client'

import { useMemo, useState } from 'react'
import type { HwatuCard } from '@/features/hwatu/types'
import { evaluateSeotdaHand, describeSeotdaHand } from '@/features/seotda/engine'
import { GOSTOP_RULES_STANDARD } from '@/features/gostop/types'
import { captureOf, hasChongtong, scoreGostop } from '@/features/gostop/scoring'
import type { PokerCard } from '@/features/poker/cards'
import { describePokerHand, evaluatePokerHand } from '@/features/poker/engine'
import { Panel } from '@/components/ui'
import { POKER_CATEGORY_STATS, seotdaStats } from '../stats'

/** 어드바이저 판정 결과 패널 3종 — 게임별 표시만 담당하고 선택 상태는 advisor-client 가 소유한다. */

export function SeotdaResult({ cards }: { cards: readonly HwatuCard[] }) {
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
              서열 {result.stats.tierPosition}위 / {result.stats.totalTiers}단계
            </span>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-muted">
              동급 조합 {result.stats.sameTierCount}개
            </span>
          </div>
          <div className="space-y-1.5 text-left">
            <div className="flex justify-between text-xs font-medium">
              <span className="text-win">이길 확률 {(result.stats.winRate * 100).toFixed(1)}%</span>
              <span className="text-muted">
                {result.stats.replayRate > 0
                  ? `재경기 ${(result.stats.replayRate * 100).toFixed(1)}% · `
                  : ''}
                질 확률 {(result.stats.loseRate * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-bg-deep/70">
              <div className="bg-win" style={{ width: `${result.stats.winRate * 100}%` }} />
              <div className="bg-white/25" style={{ width: `${result.stats.replayRate * 100}%` }} />
              <div className="bg-accent" style={{ width: `${result.stats.loseRate * 100}%` }} />
            </div>
            <p className="text-[11px] text-muted">
              남은 18장으로 상대가 받을 수 있는 153가지 패와 모두 겨룬 결과입니다
            </p>
          </div>
        </>
      ) : (
        <p className="pt-9 text-sm text-muted">
          {cards.length < 2 ? '카드 2장을 선택하세요' : '판정할 수 없는 조합입니다'}
        </p>
      )}
    </Panel>
  )
}

export function GostopResult({ cards }: { cards: readonly HwatuCard[] }) {
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
            <p className="text-5xl font-black text-warn">{result.score.total}점</p>
            <p className="mt-1 text-xs text-muted">
              광 {result.capture.gwang.length} · 열끗 {result.capture.yeol.length} · 띠{' '}
              {result.capture.tti.length} · 피 {result.capture.piValue}
              {result.chongtong ? ' · 총통!' : ''}
              {result.score.canStop ? ' · 스톱 선언 가능' : ''}
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
            <p className="text-center text-sm text-muted">아직 점수가 나지 않았습니다</p>
          )}
        </>
      ) : (
        <p className="py-7 text-center text-sm text-muted">획득한 패를 선택하세요</p>
      )}

      <div className="grid grid-cols-3 gap-2">
        <CountStepper label="고" value={goCount} onChange={setGoCount} />
        <CountStepper label="흔들기" value={shakeCount} onChange={setShakeCount} />
        <CountStepper label="폭탄" value={bombCount} onChange={setBombCount} />
      </div>
    </Panel>
  )
}

export function PokerResult({ cards }: { cards: readonly PokerCard[] }) {
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
              족보 {stats.position}위 / 10
            </span>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-muted">
              5장을 뽑았을 때 나올 확률 {formatProbability(stats.probability)}
            </span>
          </div>
        </>
      ) : (
        <p className="pt-9 text-sm text-muted">
          {cards.length < 5 ? `카드 ${5 - cards.length}장 더 선택` : '판정할 수 없는 조합입니다'}
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

/** 고/흔들기/폭탄 횟수 — 0~9 소형 카운터. 공용 Stepper 보다 좁은 자리에 맞춘 변형. */
function CountStepper({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (next: number) => void
}) {
  return (
    <div className="rounded-xl bg-bg px-2 py-1.5 text-center">
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="min-h-8 min-w-8 text-lg text-muted active:text-text"
          onClick={() => onChange(Math.max(0, value - 1))}
          aria-label={`${label} 감소`}
        >
          −
        </button>
        <span className="text-lg font-black tabular-nums">{value}</span>
        <button
          type="button"
          className="min-h-8 min-w-8 text-lg text-muted active:text-text"
          onClick={() => onChange(Math.min(9, value + 1))}
          aria-label={`${label} 증가`}
        >
          +
        </button>
      </div>
    </div>
  )
}
