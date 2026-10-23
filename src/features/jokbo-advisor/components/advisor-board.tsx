'use client'

import { clsx } from 'clsx'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { findCard } from '@/features/hwatu/cards'
import type { CardId, HwatuCard } from '@/features/hwatu/types'
import { Button, PaneGroup, Panel, ScrollPane, useToast } from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'
import { CardPicker } from './card-picker'
import { SeotdaResult, type VisionSource } from './advisor-results'
import { SeotdaRankingPanel } from './seotda-ranking-panel'
import { VisionCapture } from './vision-capture'

const MAX_SELECT = 3
const MIN_HAND = 2

/**
 * 판독기 본문. 페이지 껍데기(`/advisor`)와 방 안 시트가 같은 화면을 쓰기 때문에
 * 여기에는 헤더·뒤로가기 같은 라우트 소유물을 두지 않는다. 높이는 부모가 정한다 —
 * `PaneGroup`이 `min-h-0 flex-1`이라 높이가 정해진 flex 컨테이너 안에서만 접힌다.
 */
export function AdvisorBoard({
  visionEnabled,
  className,
}: {
  visionEnabled: boolean
  className?: string
}) {
  const [selected, setSelected] = useState<ReadonlySet<CardId>>(new Set())

  const [vision, setVision] = useState<VisionSource | null>(null)
  // 모바일 탭을 부모가 들고 있는 이유: 사진 인식이 끝나면 결과 패널로 데려가야 한다.
  const [pane, setPane] = useState<'picker' | 'result'>('picker')
  const { toast } = useToast()
  const { d } = useDict()

  function toggle(id: CardId) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else if (next.size < MAX_SELECT) next.add(id)
    setVision(null)
    setSelected(next)
    if (next.size >= MIN_HAND && next.size > selected.size) setPane('result')
  }

  function applyRecognized(ids: readonly CardId[], confidence: number) {
    const applied = ids.slice(0, MAX_SELECT)
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

  return (
    <div className={clsx('flex min-h-0 flex-1 flex-col gap-4', className)}>
      <PaneGroup
        ariaLabel={d.advisor.paneNavLabel}
        columns="lg:grid-cols-[7fr_5fr]"
        activeKey={pane}
        onActiveKeyChange={(key) => setPane(key === 'result' ? 'result' : 'picker')}
        panes={[
          {
            key: 'picker',
            label: d.advisor.pickerTab,
            node: (
              <PickerPane
                selectedCount={selected.size}
                max={MAX_SELECT}
                onClear={
                  selected.size > 0
                    ? () => {
                        setSelected(new Set())
                        setVision(null)
                      }
                    : undefined
                }
                footer={
                  <VisionCapture
                    enabled={visionEnabled}
                    onRecognized={applyRecognized}
                  />
                }
              >
                <CardPicker
                  selected={selected}
                  maxSelect={MAX_SELECT}
                  onToggle={toggle}
                />
              </PickerPane>
            ),
          },
          {
            key: 'result',
            label: d.advisor.resultTab,
            node: <ResultPane cards={cards} vision={vision} />,
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
  cards,
  vision,
}: {
  cards: readonly HwatuCard[]
  vision: VisionSource | null
}) {
  const { d } = useDict()
  return (
    <ScrollPane
      label={d.advisor.resultScrollLabel}
      className="rise-in rise-in-2 flex flex-col gap-4"
    >
      <div className="shrink-0 space-y-4">
        <SeotdaResult cards={cards} vision={vision} />
      </div>
      <SeotdaRankingPanel cards={cards} />
    </ScrollPane>
  )
}
