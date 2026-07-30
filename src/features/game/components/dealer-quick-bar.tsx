'use client'

import { useEffect, useRef, useState } from 'react'
import { Badge, Button } from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'
import type { BetActionView, RoomSnapshot } from '../types'
import type { RunAction } from './shared'
import { useDealerPanelControls } from './dealer-panel-controls'
import { DealerVoidDialog } from './dealer-panel-dialogs'
import { DealerToolsSheet } from './dealer-tools-sheet'

/**
 * 모바일 하단 액션바 라인에 얹는 딜러 컴팩트 컨트롤. 판 시작/종료/무효는 여기서
 * 바로 처리하고, 승인 큐·되돌리기·고스톱 점수·세션 정산처럼 자주 안 쓰거나 화면이
 * 필요한 것은 "딜러 도구" 트리거(승인 대기 배지 포함)로 시트를 연다.
 */
export function DealerQuickBar({
  snapshot,
  pendingActions,
  selfId,
  runAction,
  staleReason = null,
}: {
  snapshot: RoomSnapshot
  pendingActions: readonly BetActionView[]
  selfId: string
  runAction: RunAction

  staleReason?: string | null
}) {
  const { d } = useDict()
  const controls = useDealerPanelControls({ snapshot, selfId, runAction })
  const [toolsOpen, setToolsOpen] = useState(false)
  const openedForPickWinner = useRef(false)

  useEffect(() => {
    if (controls.mode === 'pickWinner') {
      openedForPickWinner.current = true
      setToolsOpen(true)
      return
    }
    if (openedForPickWinner.current) {
      openedForPickWinner.current = false
      setToolsOpen(false)
    }
  }, [controls.mode])

  const round = controls.round
  const pendingCount = pendingActions.length

  return (
    <div className="flex items-stretch gap-2">
      {!round ? (
        <Button
          variant="primary"
          className="flex-1"
          loading={controls.firingSlot === 'start'}
          loadingLabel={d.ui.processing}
          disabled={controls.isPending || staleReason !== null}
          disabledReason={staleReason ?? undefined}
          onClick={controls.startRoundNow}
        >
          ▶ {d.dealer.startRound}
        </Button>
      ) : (
        <>
          <Button
            variant="win"
            className="flex-1"
            loading={controls.firingSlot === 'end'}
            loadingLabel={d.ui.processing}
            disabled={
              controls.isPending ||
              pendingCount > 0 ||
              staleReason !== null ||
              Boolean(controls.verifiedFairness && !controls.verifiedDealReady)
            }
            disabledReason={
              pendingCount > 0
                ? d.dealer.pendingFirst
                : (staleReason ??
                  (controls.verifiedFairness && !controls.verifiedDealReady
                    ? d.fairness.waitForSeeds
                    : undefined))
            }
            onClick={controls.beginEndRound}
          >
            🏁 {d.dealer.endRound}
          </Button>
          <Button
            variant="danger"
            loading={controls.firingSlot === 'void'}
            loadingLabel={d.ui.processing}
            disabled={controls.isPending || staleReason !== null}
            disabledReason={staleReason ?? undefined}
            onClick={() => controls.openVoidDialog('current')}
          >
            {d.dealer.voidRound}
          </Button>
        </>
      )}
      <Button
        type="button"
        variant="outline"
        aria-label={
          pendingCount > 0
            ? format(d.dealer.toolsAriaPending, { n: pendingCount })
            : d.dealer.toolsAria
        }
        aria-haspopup="dialog"
        aria-expanded={toolsOpen}
        className="shrink-0"
        onClick={() => setToolsOpen(true)}
      >
        🛠️
        {pendingCount > 0 ? <Badge tone="warn">{pendingCount}</Badge> : null}
      </Button>

      <DealerVoidDialog
        voidTarget={controls.voidTarget}
        voidReason={controls.voidReason}
        onSelectReason={controls.setVoidReason}
        onConfirm={controls.confirmVoid}
        onClose={() => controls.setVoidTarget(null)}
        lastResultSeq={snapshot.lastResult?.seq}
      />

      <DealerToolsSheet
        open={toolsOpen}
        onClose={() => {
          setToolsOpen(false)
          if (controls.mode === 'pickWinner') controls.cancelPickWinner()
        }}
        controls={controls}
        snapshot={snapshot}
        pendingActions={pendingActions}
        selfId={selfId}
        runAction={runAction}
        staleReason={staleReason}
      />
    </div>
  )
}
