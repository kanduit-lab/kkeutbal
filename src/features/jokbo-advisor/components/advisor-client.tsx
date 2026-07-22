'use client'

import Link from 'next/link'
import { useMemo, useRef, useState, useTransition } from 'react'
import { findCard } from '@/features/hwatu/cards'
import type { CardId, GameType, HwatuCard } from '@/features/hwatu/types'
import { evaluateSeotdaHand, describeSeotdaHand } from '@/features/seotda/engine'
import { GOSTOP_RULES_STANDARD } from '@/features/gostop/types'
import { captureOf, hasChongtong, scoreGostop } from '@/features/gostop/scoring'
import { findPokerCard } from '@/features/poker/cards'
import type { PokerCard } from '@/features/poker/cards'
import { describePokerHand, evaluatePokerHand } from '@/features/poker/engine'
import { Button, Panel, Spinner, useToast } from '@/components/ui'
import { POKER_CATEGORY_STATS, seotdaStats } from '../stats'
import { recognizeHand } from '../vision/actions'
import { CardPicker } from './card-picker'
import { PokerPicker } from './poker-picker'

type AdvisorTab = 'seotda' | 'gostop' | 'poker'

const TAB_LABELS: Record<AdvisorTab, string> = {
  seotda: '🎴 섯다',
  gostop: '🌸 고스톱',
  poker: '♠ 포커',
}

const POKER_MAX_SELECT = 7

export function AdvisorClient({ visionEnabled }: { visionEnabled: boolean }) {
  const [tab, setTab] = useState<AdvisorTab>('seotda')
  const [selected, setSelected] = useState<ReadonlySet<CardId>>(new Set())
  const [pokerSelected, setPokerSelected] = useState<ReadonlySet<string>>(new Set())
  const { toast } = useToast()

  const hwatuGameType: GameType = tab === 'gostop' ? 'gostop' : 'seotda'
  const maxSelect = hwatuGameType === 'seotda' ? 2 : 30

  function toggle(id: CardId) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else if (next.size < maxSelect) next.add(id)
      return next
    })
  }

  function togglePoker(id: string) {
    setPokerSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else if (next.size < POKER_MAX_SELECT) next.add(id)
      return next
    })
  }

  function switchTab(next: AdvisorTab) {
    // 화투 탭끼리 전환할 때만 선택을 비운다 — 포커 선택은 별도 상태라 건드릴 필요 없음.
    if (next !== 'poker' && tab !== next) setSelected(new Set())
    setTab(next)
  }

  const cards = useMemo(
    () =>
      [...selected]
        .map((id) => findCard(id))
        .filter((card): card is HwatuCard => card !== undefined),
    [selected],
  )

  const pokerCards = useMemo(
    () =>
      [...pokerSelected]
        .map((id) => findPokerCard(id))
        .filter((card): card is PokerCard => card !== undefined),
    [pokerSelected],
  )

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-16 pt-6 lg:h-dvh lg:overflow-hidden lg:px-8 lg:pb-8 lg:pt-8">
      <header className="rise-in flex items-center gap-3">
        <Link href="/" className="text-2xl text-muted transition-colors hover:text-text">
          ←
        </Link>
        <div>
          <h1 className="font-brush text-3xl font-black lg:text-4xl">족보 도우미</h1>
          <p className="mt-0.5 text-xs text-muted lg:text-sm">카드를 고르면 족보가 바로 나옵니다</p>
        </div>
      </header>

      <div className="rise-in rise-in-1 grid max-w-xl grid-cols-3 gap-2">
        {(['seotda', 'gostop', 'poker'] as const).map((type) => (
          <Button
            key={type}
            type="button"
            variant={tab === type ? 'primary' : 'surface'}
            onClick={() => switchTab(type)}
          >
            {TAB_LABELS[type]}
          </Button>
        ))}
      </div>

      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-12">
        <div className="lg:order-2 lg:col-span-5 lg:min-h-0 lg:overflow-y-auto">
          <div className="rise-in rise-in-2 space-y-5">
            {tab === 'seotda' ? <SeotdaResult cards={cards} /> : null}
            {tab === 'gostop' ? <GostopResult cards={cards} /> : null}
            {tab === 'poker' ? <PokerResult cards={pokerCards} /> : null}

      {tab !== 'poker' ? (
        <VisionCapture
          gameType={hwatuGameType}
          enabled={visionEnabled}
          onRecognized={(ids, confidence) => {
            setSelected(new Set(ids.slice(0, maxSelect)))
            toast(
              `카드 ${ids.length}장 인식 (정확도 ${(confidence * 100).toFixed(0)}%) — 잘못 짚었으면 직접 고치세요`,
              confidence >= 0.9 ? 'success' : 'info',
            )
          }}
        />
      ) : null}
          </div>
        </div>

        <div className="rise-in rise-in-3 lg:order-1 lg:col-span-7 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
      {tab === 'poker' ? (
        <Panel className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-muted">
              카드 선택 ({pokerSelected.size}/{POKER_MAX_SELECT})
            </h2>
            {pokerSelected.size > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => setPokerSelected(new Set())}>
                전체 해제
              </Button>
            ) : null}
          </div>
          <PokerPicker selected={pokerSelected} maxSelect={POKER_MAX_SELECT} onToggle={togglePoker} />
        </Panel>
      ) : (
        <Panel className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-muted">
              카드 선택 ({selected.size}/{hwatuGameType === 'seotda' ? 2 : '∞'})
            </h2>
            {selected.size > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                전체 해제
              </Button>
            ) : null}
          </div>
          <CardPicker
            gameType={hwatuGameType}
            selected={selected}
            maxSelect={maxSelect}
            onToggle={toggle}
          />
        </Panel>
      )}
        </div>
      </div>
    </main>
  )
}

function SeotdaResult({ cards }: { cards: readonly HwatuCard[] }) {
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
              상대 1명이 남은 18장에서 받는 153가지 패와 전부 붙였을 때 기준
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

function GostopResult({ cards }: { cards: readonly HwatuCard[] }) {
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
        <Stepper label="고" value={goCount} onChange={setGoCount} />
        <Stepper label="흔들기" value={shakeCount} onChange={setShakeCount} />
        <Stepper label="폭탄" value={bombCount} onChange={setBombCount} />
      </div>
    </Panel>
  )
}

function PokerResult({ cards }: { cards: readonly PokerCard[] }) {
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
              5장 뽑아 나올 확률 {formatProbability(stats.probability)}
            </span>
          </div>
        </>
      ) : (
        <p className="pt-9 text-sm text-muted">
          {cards.length < 5 ? `카드를 ${5 - cards.length}장 더 고르면 확인돼요` : '판정할 수 없는 조합입니다'}
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

function Stepper({
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

function VisionCapture({
  gameType,
  enabled,
  onRecognized,
}: {
  gameType: GameType
  enabled: boolean
  onRecognized: (ids: readonly CardId[], confidence: number) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  async function handleFile(file: File) {
    const dataUrl = await downscale(file, 1568)
    startTransition(async () => {
      const result = await recognizeHand({ imageDataUrl: dataUrl, gameType })
      if (!result.success) {
        toast(result.error, 'error')
        return
      }
      if (result.data.cardIds.length === 0) {
        toast('카드를 알아보지 못했어요. 더 밝은 곳에서 다시 찍어보세요', 'error')
        return
      }
      onRecognized(result.data.cardIds, result.data.confidence)
    })
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void handleFile(file)
          event.target.value = ''
        }}
      />
      <Button
        type="button"
        variant="surface"
        size="lg"
        className="w-full border border-white/10"
        disabled={!enabled || isPending}
        disabledReason={!enabled ? '사진 인식이 꺼져 있어요 (설정 필요)' : undefined}
        onClick={() => inputRef.current?.click()}
      >
        {isPending ? <Spinner label="확인하는 중…" /> : '📷 사진으로 확인'}
      </Button>
    </div>
  )
}

async function downscale(file: File, maxEdge: number): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas context unavailable')
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.8)
}
