'use client'

import { useDict } from '@/lib/i18n/client'
import type { BetActionView, RoomSnapshot } from '../types'
import { Button, Panel } from '@/components/ui'
import type { RunAction } from './shared'
import { PendingApprovalQueue } from './dealer-panel-pending-queue'
import { RevertList } from './dealer-panel-revert-list'
import { useDealerPanelControls } from './dealer-panel-controls'
import { DealerPickWinnerForm } from './dealer-panel-pick-winner'
import { DealerSettleDialog, DealerVoidDialog } from './dealer-panel-dialogs'

/**
 * 데스크톱 전용(항상 `lg` 우측 컬럼에 인라인으로 뜬다). 모바일은 같은 상태·액션
 * 로직(`useDealerPanelControls`)을 `DealerQuickBar` + `DealerToolsSheet`가 쓴다 —
 * 여기서 마크업만 데스크톱 Panel 레이아웃으로 그린다.
 */
export function DealerPanel({
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
  const c = useDealerPanelControls({ snapshot, selfId, runAction })

  return (
    <Panel className="mb-4 space-y-4 border border-accent/20">
      <h2 className="text-sm font-bold text-accent">{d.dealer.title}</h2>
      {c.mode === 'idle' ? (
        <div className="grid grid-cols-2 gap-2">
          {!c.round ? (
            <>
              <Button
                variant="primary"
                size="lg"
                loading={c.firingSlot === 'start'}
                loadingLabel={d.ui.processing}
                disabled={c.isPending || staleReason !== null}
                disabledReason={staleReason ?? undefined}
                onClick={c.startRoundNow}
              >
                ▶ {d.dealer.startRound}
              </Button>
              {snapshot.lastResult ? (
                <Button
                  variant="danger"
                  loading={c.firingSlot === 'void'}
                  loadingLabel={d.ui.processing}
                  disabled={c.isPending || staleReason !== null}
                  disabledReason={staleReason ?? undefined}
                  onClick={() => c.openVoidDialog('last')}
                >
                  {d.dealer.voidLastRound}
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <Button
                variant="win"
                size="lg"
                loading={c.firingSlot === 'end'}
                loadingLabel={d.ui.processing}
                disabled={
                  c.isPending ||
                  pendingActions.length > 0 ||
                  staleReason !== null ||
                  Boolean(c.verifiedFairness && !c.verifiedDealReady)
                }
                disabledReason={
                  pendingActions.length > 0
                    ? d.dealer.pendingFirst
                    : (staleReason ??
                      (c.verifiedFairness && !c.verifiedDealReady
                        ? d.fairness.waitForSeeds
                        : undefined))
                }
                onClick={c.beginEndRound}
              >
                🏁 {d.dealer.endRound}
              </Button>
              <Button
                variant="danger"
                loading={c.firingSlot === 'void'}
                loadingLabel={d.ui.processing}
                disabled={c.isPending || staleReason !== null}
                disabledReason={staleReason ?? undefined}
                onClick={() => c.openVoidDialog('current')}
              >
                {d.dealer.voidRound}
              </Button>
            </>
          )}
          {c.isHost && !c.round ? (
            <Button
              variant="outline"
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
        </div>
      ) : null}
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
          onCancel={c.cancelPickWinner}
          onConfirm={c.confirmWinnerNow}
          // 폼을 먼저 닫는다 — 무효화가 끝나면 `round`가 사라지는데 `mode`가 'pickWinner'로
          // 남아 있으면 패널이 폼도 버튼 그리드도 못 그린다.
          onReplay={() => {
            c.cancelPickWinner()
            c.openVoidDialog('replay')
          }}
        />
      ) : null}

      <DealerVoidDialog
        voidTarget={c.voidTarget}
        voidReason={c.voidReason}
        onSelectReason={c.setVoidReason}
        onConfirm={c.confirmVoid}
        onClose={() => c.setVoidTarget(null)}
        lastResultSeq={snapshot.lastResult?.seq}
      />
      <DealerSettleDialog
        open={c.settleOpen}
        onConfirm={c.confirmSettle}
        onClose={() => c.setSettleOpen(false)}
      />
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
    </Panel>
  )
}
