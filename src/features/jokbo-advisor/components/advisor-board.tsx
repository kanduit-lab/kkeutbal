'use client'

import { clsx } from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { findCard } from '@/features/hwatu/cards'
import type { CardId, GameType, HwatuCard } from '@/features/hwatu/types'
import { findPokerCard } from '@/features/poker/cards'
import type { PokerCard } from '@/features/poker/cards'
import { Button, PaneGroup, Panel, ScrollPane, Segmented, useToast } from '@/components/ui'
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

/** 포커 족보가 성립하는 최소 장수. 이보다 적으면 판정할 게 없다. */
const POKER_MIN_HAND = 5

const GOSTOP_MAX_SELECT = 30

/**
 * 판독기 본문. 페이지 껍데기(`/advisor`)와 방 안 시트가 같은 화면을 쓰기 때문에
 * 여기에는 헤더·뒤로가기 같은 라우트 소유물을 두지 않는다. 높이는 부모가 정한다 —
 * `PaneGroup`이 `min-h-0 flex-1`이라 높이가 정해진 flex 컨테이너 안에서만 접힌다.
 */
export function AdvisorBoard({
  visionEnabled,
  initialTab = 'seotda',
  className,
}: {
  visionEnabled: boolean
  initialTab?: AdvisorTab
  className?: string
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

  // `?game=` 링크나 방의 게임 종류로 들어왔을 때 그 탭으로 연다.
  useEffect(() => {
    switchTab(initialTab)
    // initialTab이 바뀔 때만 반응한다. switchTab은 매 렌더 새로 만들어지는 클로저라
    // 의존성에 넣으면 매 렌더 실행돼버린다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab])

  /**
   * 판정에 필요한 장수가 채워지는 순간 결과 패널로 넘어간다. 세로 화면은 픽커와 결과가
   * 탭으로 갈려 있어서, 두 장을 고르고도 손으로 탭을 눌러야 족보가 보였다 — 고르는 이유가
   * 곧 판정을 보는 것인데 그 마지막 한 걸음이 늘 수동이었다.
   *
   * 고스톱은 대상이 아니다. 획득한 패를 계속 담는 방식이라 "다 골랐다"는 시점 자체가 없고,
   * 중간에 화면이 넘어가면 오히려 다음 장을 못 고른다.
   */
  function revealIfComplete(count: number) {
    const needed = tab === 'poker' ? POKER_MIN_HAND : tab === 'seotda' ? maxSelect : null
    if (needed !== null && count === needed) setPane('result')
  }

  function toggle(id: CardId) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else if (next.size < maxSelect) next.add(id)
    setVision(null)
    setSelected(next)
    revealIfComplete(next.size)
  }

  function togglePoker(id: string) {
    const next = new Set(pokerSelected)
    if (next.has(id)) next.delete(id)
    else if (next.size < POKER_MAX_SELECT) next.add(id)
    setPokerSelected(next)
    revealIfComplete(next.size)
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
    <div className={clsx('flex min-h-0 flex-1 flex-col gap-4', className)}>
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
                // 사진 인식은 "직접 고르기"의 대안이므로 고르는 화면 바로 아래 둔다.
                // 결과 패널에 있을 때는 판정을 보러 넘어간 뒤에야 보여서, 손으로 고르기
                // 시작한 사람에게는 있는 줄도 몰랐던 기능이었다.
                footer={
                  <VisionCapture
                    gameType={hwatuGameType}
                    enabled={visionEnabled}
                    onRecognized={applyRecognized}
                  />
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
            node: <ResultPane tab={tab} cards={cards} pokerCards={pokerCards} vision={vision} />,
          },
        ]}
      />
    </div>
  )
}

function PickerPane({
  selectedCount,
  max,
  onClear,
  footer,
  children,
}: {
  selectedCount: number
  max: number
  onClear?: () => void
  footer?: ReactNode
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
      {/*
        데스크톱에서는 카드 20장이 패널 높이를 다 채우지 못해 그리드와 아래 버튼 사이에
        빈 구멍이 남는다. 남는 높이를 위아래로 나눠 카드를 가운데 두면 구멍이 아니라
        여백으로 읽힌다.

        중앙정렬은 반드시 `safe`여야 한다. 스크롤 컨테이너에 그냥 `justify-center`를 걸면
        내용이 넘칠 때 위로 삐져나간 부분이 스크롤로 닿지 않는 자리에 박히고, 그 위에 있는
        탭 전환 라디오가 카드 클릭을 가로챈다 — 세로 화면은 10개월 2열이라 늘 넘친다.
        `safe`는 넘치는 순간 start 정렬로 물러나므로 그 함정이 없다.
      */}
      <ScrollPane
        label={d.advisor.pickerScrollLabel}
        className="flex flex-col [justify-content:safe_center]"
      >
        <div className="shrink-0">{children}</div>
      </ScrollPane>
      {footer ? <div className="shrink-0 border-t border-white/10 pt-3">{footer}</div> : null}
    </Panel>
  )
}

function ResultPane({
  tab,
  cards,
  pokerCards,
  vision,
}: {
  tab: AdvisorTab
  cards: readonly HwatuCard[]
  pokerCards: readonly PokerCard[]
  vision: VisionSource | null
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
    </ScrollPane>
  )
}
