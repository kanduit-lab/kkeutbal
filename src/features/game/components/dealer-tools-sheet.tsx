'use client'

import { Button, Sheet } from '@/components/ui'
import { useDict } from '@/lib/i18n/client'
import type { BetActionView, RoomSnapshot } from '../types'
import type { RunAction } from './shared'
import type { useDealerPanelControls } from './dealer-panel-controls'
import { PendingApprovalQueue } from './dealer-panel-pending-queue'
import { RevertList } from './dealer-panel-revert-list'
import { DealerPickWinnerForm } from './dealer-panel-pick-winner'
import { DealerSettleDialog } from './dealer-panel-dialogs'

/**
 * 모바일 "딜러 도구" 시트. `mode==='pickWinner'`이면 승자 확정 폼을, 아니면
 * 승인 대기 큐 + 되돌리기 목록 + (판 없을 때) 지난 판 취소·세션 정산을 보여준다.
 * 판 시작/종료/무효는 시트를 열지 않고 `DealerQuickBar`의 바로 처리한다.
 */
export function DealerToolsSheet({
  open,
  onClose,
  controls,
  snapshot,
  pendingActions,
  selfId,
  runAction,
  staleReason = null,
}: {
  open: boolean
  onClose: () => void
  controls: ReturnType<typeof useDealerPanelControls>
  snapshot: RoomSnapshot
  pendingActions: readonly BetActionView[]
  selfId: string
  runAction: RunAction

  staleReason?: string | null
}) {
  const { d } = useDict()
  const c = controls

  return (
    <>
      <Sheet open={open} onClose={onClose} ariaLabel={d.dealer.toolsTitle} className="space-y-4">
        <h2 className="text-sm font-bold text-accent">{d.dealer.toolsTitle}</h2>
        {c.mode === 'pickWinner' && c.round ? (
          <DealerPickWinnerForm
            round={c.round}
            isGostop={c.isGostop}
            eligiblePlayers={c.eligiblePlayers}
            foldWinWinner={c.foldWinWinner}
            winnerId={c.winnerId}
            setWinnerId={c.setWinnerId}
            gostop={c.gostop}
            setGostop={c.setGostop}
            gostopLosers={c.gostopLosers}
            pointValue={snapshot.room.pointValue}
            note={c.note}
            setNote={c.setNote}
            noteExample={c.noteExample}
            selectedWinnerIsEligible={c.selectedWinnerIsEligible}
            isPending={c.isPending}
            firingSlot={c.firingSlot}
            staleReason={staleReason}
            onCancel={() => {
              c.cancelPickWinner()
              onClose()
            }}
            onConfirm={c.confirmWinnerNow}
          />
        ) : (
          <div className="space-y-3">
            {!c.round && c.isHost ? (
              <Button
                variant="outline"
                className="w-full"
                loading={c.firingSlot === 'settle'}
                loadingLabel={d.ui.processing}
                disabled={c.isPending || snapshot.endedRounds === 0 || staleReason !== null}
                disabledReason={
                  snapshot.endedRounds === 0 ? d.dealer.noEndedRounds : (staleReason ?? undefined)
                }
                onClick={() => c.setSettleOpen(true)}
              >
                🧾 {d.dealer.settleSession}
              </Button>
            ) : null}
            {!c.round && snapshot.lastResult ? (
              <Button
                variant="danger"
                className="w-full"
                loading={c.firingSlot === 'void'}
                loadingLabel={d.ui.processing}
                disabled={c.isPending || staleReason !== null}
                disabledReason={staleReason ?? undefined}
                onClick={() => c.openVoidDialog('last')}
              >
                {d.dealer.voidLastRound}
              </Button>
            ) : null}
            <PendingApprovalQueue
              pendingActions={pendingActions}
              selfId={selfId}
              runAction={runAction}
              nameOf={c.nameOf}
              betLabels={c.betLabels}
              staleReason={staleReason}
            />
            <RevertList
              snapshot={snapshot}
              selfId={selfId}
              runAction={runAction}
              staleReason={staleReason}
            />
            <p className="text-xs text-muted">{d.dealer.memberActionsHint}</p>
          </div>
        )}
      </Sheet>
      <DealerSettleDialog
        open={c.settleOpen}
        onConfirm={c.confirmSettle}
        onClose={() => c.setSettleOpen(false)}
      />
    </>
  )
}
