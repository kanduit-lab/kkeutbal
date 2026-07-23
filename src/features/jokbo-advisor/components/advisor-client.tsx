'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { findCard } from '@/features/hwatu/cards'
import type { CardId, GameType, HwatuCard } from '@/features/hwatu/types'
import { findPokerCard } from '@/features/poker/cards'
import type { PokerCard } from '@/features/poker/cards'
import { Button, Panel, useToast } from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'
import { CardPicker } from './card-picker'
import { PokerPicker } from './poker-picker'
import { GostopResult, PokerResult, SeotdaResult } from './advisor-results'
import { SeotdaRankingPanel } from './seotda-ranking-panel'
import { VisionCapture } from './vision-capture'

type AdvisorTab = 'seotda' | 'gostop' | 'poker'

/** 탭 이모지 — 게임 이름 텍스트는 사전 games.* 를 그대로 쓴다 (중복 정의 금지). */
const TAB_EMOJI: Record<AdvisorTab, string> = {
  seotda: '🎴',
  gostop: '🌸',
  poker: '♠',
}

const POKER_MAX_SELECT = 7

/** 족보 판독 화면 — 탭·카드 선택 상태를 소유하고, 판정 표시는 advisor-results 에 맡긴다. */
export function AdvisorClient({ visionEnabled }: { visionEnabled: boolean }) {
  const [tab, setTab] = useState<AdvisorTab>('seotda')
  const [selected, setSelected] = useState<ReadonlySet<CardId>>(new Set())
  const [pokerSelected, setPokerSelected] = useState<ReadonlySet<string>>(new Set())
  const { toast } = useToast()
  const { d } = useDict()

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
          <h1 className="font-brush text-3xl font-black lg:text-4xl">{d.home.advisor}</h1>
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
            {TAB_EMOJI[type]} {d.games[type]}
          </Button>
        ))}
      </div>

      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-12">
        <div className="lg:order-2 lg:col-span-5 lg:min-h-0 lg:overflow-y-auto">
          <div className="rise-in rise-in-2 space-y-5">
            {tab === 'seotda' ? <SeotdaResult cards={cards} /> : null}
            {/* 서열표는 결과 쪽 컬럼에 둔다 — 피커 안에 넣으면 카드 그리드가 반으로 눌리고
                패널이 좁은 스크롤 상자에 갇힌다. */}
            {tab === 'seotda' ? <SeotdaRankingPanel cards={cards} /> : null}
            {tab === 'gostop' ? <GostopResult cards={cards} /> : null}
            {tab === 'poker' ? <PokerResult cards={pokerCards} /> : null}

            {tab !== 'poker' ? (
              <VisionCapture
                gameType={hwatuGameType}
                enabled={visionEnabled}
                onRecognized={(ids, confidence) => {
                  setSelected(new Set(ids.slice(0, maxSelect)))
                  toast(
                    format(d.advisor.vision.recognizedToast, {
                      n: ids.length,
                      confidence: (confidence * 100).toFixed(0),
                    }),
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
                  {format(d.advisor.cardSelectionCount, {
                    n: pokerSelected.size,
                    max: POKER_MAX_SELECT,
                  })}
                </h2>
                {pokerSelected.size > 0 ? (
                  <Button size="sm" variant="ghost" onClick={() => setPokerSelected(new Set())}>
                    {d.common.clearAll}
                  </Button>
                ) : null}
              </div>
              <PokerPicker
                selected={pokerSelected}
                maxSelect={POKER_MAX_SELECT}
                onToggle={togglePoker}
              />
            </Panel>
          ) : (
            <Panel className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-muted">
                  {format(d.advisor.cardSelectionCount, {
                    n: selected.size,
                    max: hwatuGameType === 'seotda' ? 2 : '∞',
                  })}
                </h2>
                {selected.size > 0 ? (
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                    {d.common.clearAll}
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
