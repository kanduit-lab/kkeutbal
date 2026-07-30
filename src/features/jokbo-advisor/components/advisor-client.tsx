'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { findCard } from '@/features/hwatu/cards'
import type { CardId, GameType, HwatuCard } from '@/features/hwatu/types'
import { findPokerCard } from '@/features/poker/cards'
import type { PokerCard } from '@/features/poker/cards'
import {
  Button,
  FixedPage,
  PageHeader,
  PaneGroup,
  Panel,
  ScrollPane,
  Segmented,
  useToast,
} from '@/components/ui'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { format, useDict } from '@/lib/i18n/client'
import { CardPicker } from './card-picker'
import { PokerPicker } from './poker-picker'
import { GostopResult, PokerResult, SeotdaResult, type VisionSource } from './advisor-results'
import { PokerRankingPanel } from './poker-ranking-panel'
import { SeotdaRankingPanel } from './seotda-ranking-panel'
import { VisionCapture } from './vision-capture'

export type AdvisorTab = 'seotda' | 'gostop' | 'poker'

const TAB_EMOJI: Record<AdvisorTab, string> = {
  seotda: '🎴',
  gostop: '🌸',
  poker: '♠',
}

const POKER_MAX_SELECT = 7

const GOSTOP_MAX_SELECT = 30

export function AdvisorClient({
  visionEnabled,
  initialTab = 'seotda',
}: {
  visionEnabled: boolean
  initialTab?: AdvisorTab
}) {
  const [tab, setTab] = useState<AdvisorTab>(initialTab)
  const [selected, setSelected] = useState<ReadonlySet<CardId>>(new Set())
  const [pokerSelected, setPokerSelected] = useState<ReadonlySet<string>>(new Set())

  const [vision, setVision] = useState<VisionSource | null>(null)
  // 모바일 탭을 부모가 들고 있는 이유: 사진 인식이 끝나면 결과 패널로 데려가야 한다.
  const [pane, setPane] = useState<'picker' | 'result'>('picker')
  const { toast } = useToast()
  const { d } = useDict()

  const hwatuGameType: GameType = tab === 'gostop' ? 'gostop' : 'seotda'
  const maxSelect = hwatuGameType === 'seotda' ? 2 : GOSTOP_MAX_SELECT

  function switchTab(next: AdvisorTab) {
    if (next !== 'poker' && tab !== next) {
      setSelected(new Set())
      setVision(null)
    }
    if (tab !== next) setPane('picker')
    setTab(next)
  }

  // `?game=` 링크로 들어왔을 때 그 탭으로 연다. 방 화면 등에서 붙이는 진입 링크는
  // 다른 작업 범위이고, 여기서는 받는 쪽만 담당한다 — docs/12-handoff.md 10번 참고.
  useEffect(() => {
    switchTab(initialTab)
    // initialTab이 바뀔 때만 반응한다. switchTab은 매 렌더 새로 만들어지는 클로저라
    // 의존성에 넣으면 매 렌더 실행돼버린다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab])

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

  function applyRecognized(ids: readonly CardId[], confidence: number) {
    const applied = ids.slice(0, maxSelect)
    const previous = selected
    setSelected(new Set(applied))
    setVision({ confidence })
    // 인식 결과를 확정했으면 판정을 바로 보여준다. 모바일에서 탭을 손으로
    // 눌러야 결과가 보이면 사진을 왜 찍었는지 알 수 없다.
    setPane('result')
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

  const isPoker = tab === 'poker'

  return (
    <FixedPage width="wide" className="gap-4">
      <PageHeader
        className="rise-in mb-0 shrink-0"
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
        className="rise-in rise-in-1 max-w-xl shrink-0 grid-cols-3"
      />
      <PaneGroup
        ariaLabel={d.advisor.paneNavLabel}
        columns="lg:grid-cols-[7fr_5fr]"
        activeKey={pane}
        onActiveKeyChange={(key) => setPane(key === 'result' ? 'result' : 'picker')}
        panes={[
          {
            key: 'picker',
            label: d.advisor.pickerTab,
            node: isPoker ? (
              <PickerPane
                selectedCount={pokerSelected.size}
                max={POKER_MAX_SELECT}
                onClear={pokerSelected.size > 0 ? () => setPokerSelected(new Set()) : undefined}
              >
                <PokerPicker
                  selected={pokerSelected}
                  maxSelect={POKER_MAX_SELECT}
                  onToggle={togglePoker}
                />
              </PickerPane>
            ) : (
              <PickerPane
                selectedCount={selected.size}
                max={maxSelect}
                onClear={
                  selected.size > 0
                    ? () => {
                        setSelected(new Set())
                        setVision(null)
                      }
                    : undefined
                }
              >
                <CardPicker
                  gameType={hwatuGameType}
                  selected={selected}
                  maxSelect={maxSelect}
                  onToggle={toggle}
                />
              </PickerPane>
            ),
          },
          {
            key: 'result',
            label: d.advisor.resultTab,
            node: (
              <ResultPane
                tab={tab}
                cards={cards}
                pokerCards={pokerCards}
                vision={vision}
                visionEnabled={visionEnabled}
                hwatuGameType={hwatuGameType}
                onRecognized={applyRecognized}
              />
            ),
          },
        ]}
      />
    </FixedPage>
  )
}

function PickerPane({
  selectedCount,
  max,
  onClear,
  children,
}: {
  selectedCount: number
  max: number
  onClear?: () => void
  children: ReactNode
}) {
  const { d } = useDict()
  return (
    <Panel className="rise-in rise-in-3 flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-muted">
          {format(d.advisor.cardSelectionCount, { n: selectedCount, max })}
        </h2>
        {onClear ? (
          <Button size="sm" variant="ghost" onClick={onClear}>
            {d.common.clearAll}
          </Button>
        ) : null}
      </div>
      <ScrollPane label={d.advisor.pickerScrollLabel}>{children}</ScrollPane>
    </Panel>
  )
}

function ResultPane({
  tab,
  cards,
  pokerCards,
  vision,
  visionEnabled,
  hwatuGameType,
  onRecognized,
}: {
  tab: AdvisorTab
  cards: readonly HwatuCard[]
  pokerCards: readonly PokerCard[]
  vision: VisionSource | null
  visionEnabled: boolean
  hwatuGameType: GameType
  onRecognized: (ids: readonly CardId[], confidence: number) => void
}) {
  const { d } = useDict()
  return (
    <ScrollPane
      label={d.advisor.resultScrollLabel}
      className="rise-in rise-in-2 flex flex-col gap-4"
    >
      <div className="shrink-0 space-y-4">
        {tab === 'seotda' ? <SeotdaResult cards={cards} vision={vision} /> : null}
        {tab === 'gostop' ? <GostopResult cards={cards} vision={vision} /> : null}
        {tab === 'poker' ? <PokerResult cards={pokerCards} /> : null}
      </div>
      {tab === 'seotda' ? <SeotdaRankingPanel cards={cards} /> : null}
      {tab === 'poker' ? <PokerRankingPanel cards={pokerCards} /> : null}
      {tab !== 'poker' ? (
        <div className="shrink-0">
          <VisionCapture gameType={hwatuGameType} enabled={visionEnabled} onRecognized={onRecognized} />
        </div>
      ) : null}
    </ScrollPane>
  )
}
