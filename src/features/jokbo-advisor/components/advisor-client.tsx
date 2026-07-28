'use client'

import { useMemo, useState } from 'react'
import { findCard } from '@/features/hwatu/cards'
import type { CardId, GameType, HwatuCard } from '@/features/hwatu/types'
import { findPokerCard } from '@/features/poker/cards'
import type { PokerCard } from '@/features/poker/cards'
import { Button, PageHeader, PageShell, Panel, Segmented, useToast } from '@/components/ui'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { format, useDict } from '@/lib/i18n/client'
import { CardPicker } from './card-picker'
import { PokerPicker } from './poker-picker'
import { GostopResult, PokerResult, SeotdaResult, type VisionSource } from './advisor-results'
import { SeotdaRankingPanel } from './seotda-ranking-panel'
import { VisionCapture } from './vision-capture'

type AdvisorTab = 'seotda' | 'gostop' | 'poker'

const TAB_EMOJI: Record<AdvisorTab, string> = {
  seotda: '🎴',
  gostop: '🌸',
  poker: '♠',
}

const POKER_MAX_SELECT = 7

const GOSTOP_MAX_SELECT = 30

export function AdvisorClient({ visionEnabled }: { visionEnabled: boolean }) {
  const [tab, setTab] = useState<AdvisorTab>('seotda')
  const [selected, setSelected] = useState<ReadonlySet<CardId>>(new Set())
  const [pokerSelected, setPokerSelected] = useState<ReadonlySet<string>>(new Set())

  const [vision, setVision] = useState<VisionSource | null>(null)
  const { toast } = useToast()
  const { d } = useDict()

  const hwatuGameType: GameType = tab === 'gostop' ? 'gostop' : 'seotda'
  const maxSelect = hwatuGameType === 'seotda' ? 2 : GOSTOP_MAX_SELECT

  function toggle(id: CardId) {
    setVision(null)
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
    if (next !== 'poker' && tab !== next) {
      setSelected(new Set())
      setVision(null)
    }
    setTab(next)
  }

  function applyRecognized(ids: readonly CardId[], confidence: number) {
    const applied = ids.slice(0, maxSelect)
    const previous = selected
    setSelected(new Set(applied))
    setVision({ confidence })
    const message =
      applied.length < ids.length
        ? format(d.advisor.vision.truncated, { detected: ids.length, applied: applied.length })
        : format(d.advisor.vision.recognizedToast, {
            n: applied.length,
            confidence: (confidence * 100).toFixed(0),
          })
    toast(message, confidence >= 0.9 ? 'success' : 'info', {
      action:
        previous.size > 0
          ? {
              label: d.advisor.vision.undo,
              onClick: () => {
                setSelected(previous)
                setVision(null)
                toast(d.advisor.vision.undone, 'info')
              },
            }
          : undefined,
    })
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
    <PageShell
      width="wide"
      className="flex flex-col gap-6 lg:h-dvh lg:overflow-hidden lg:pb-8 lg:pt-8"
    >
      <PageHeader
        className="rise-in mb-0"
        title={d.home.advisor}
        backHref="/"
        backLabel={d.common.home}
        actions={<LocaleSwitcher />}
      />
      <Segmented
        value={tab}
        onChange={switchTab}
        options={(['seotda', 'gostop', 'poker'] as const).map((type) => ({
          value: type,
          label: (
            <>
              <span aria-hidden="true">{TAB_EMOJI[type]}</span> {d.games[type]}
            </>
          ),
        }))}
        ariaLabel={d.home.advisor}
        className="rise-in rise-in-1 max-w-xl grid-cols-3"
      />
      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-12">
        <div className="lg:order-2 lg:col-span-5 lg:min-h-0 lg:overflow-y-auto">
          <div className="rise-in rise-in-2 space-y-5">
            {tab === 'seotda' ? <SeotdaResult cards={cards} vision={vision} /> : null}
            {tab === 'seotda' ? <SeotdaRankingPanel cards={cards} /> : null}
            {tab === 'gostop' ? <GostopResult cards={cards} vision={vision} /> : null}
            {tab === 'poker' ? <PokerResult cards={pokerCards} /> : null}
            {tab !== 'poker' ? (
              <VisionCapture
                gameType={hwatuGameType}
                enabled={visionEnabled}
                onRecognized={applyRecognized}
              />
            ) : null}
          </div>
        </div>
        <div className="rise-in rise-in-3 lg:order-1 lg:col-span-7 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
          {tab === 'poker' ? (
            <Panel className="space-y-3">
              <PickerHeader
                count={pokerSelected.size}
                max={POKER_MAX_SELECT}
                onClear={pokerSelected.size > 0 ? () => setPokerSelected(new Set()) : undefined}
              />
              <PokerPicker
                selected={pokerSelected}
                maxSelect={POKER_MAX_SELECT}
                onToggle={togglePoker}
              />
            </Panel>
          ) : (
            <Panel className="space-y-3">
              <PickerHeader
                count={selected.size}
                max={maxSelect}
                onClear={
                  selected.size > 0
                    ? () => {
                        setSelected(new Set())
                        setVision(null)
                      }
                    : undefined
                }
              />
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
    </PageShell>
  )
}

function PickerHeader({
  count,
  max,
  onClear,
}: {
  count: number
  max: number
  onClear?: () => void
}) {
  const { d } = useDict()
  return (
    <div className="lacquer sticky top-0 z-10 -mx-5 -mt-5 flex items-center justify-between rounded-t-2xl px-5 py-3">
      <h2 className="text-sm font-bold text-muted">
        {format(d.advisor.cardSelectionCount, { n: count, max })}
      </h2>
      {onClear ? (
        <Button size="sm" variant="ghost" onClick={onClear}>
          {d.common.clearAll}
        </Button>
      ) : null}
    </div>
  )
}