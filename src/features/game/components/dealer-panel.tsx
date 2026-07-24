'use client'

import { useState, useTransition } from 'react'
import { format, useDict } from '@/lib/i18n/client'
import { closeRoom } from '../actions'
import { endRound, startRound, voidRound } from '../round-actions'
import type { BetActionView, RoomSnapshot } from '../types'
import { Button, ConfirmDialog, Input, Panel } from '@/components/ui'
import { nonFoldedParticipantIds, type RunAction } from './shared'
import { VoidRoundDialog, type VoidReason } from './dealer-panel-void-dialog'
import { PendingApprovalQueue } from './dealer-panel-pending-queue'
import { RevertList } from './dealer-panel-revert-list'
import {
  GostopScoreForm,
  gostopEffectiveScore,
  gostopLoserPenalties,
  initialGostopScore,
  type GostopScoreState,
} from './gostop-score-form'

type PanelMode = 'idle' | 'pickWinner'

/**
 * 딜러/방장 전용 컨트롤 — 판 시작·종료·무효, 승인 대기열, 정정, 세션 정산.
 * 멤버 단위 조작(바이인·대리 입력·역할·위임)은 좌석 탭 → MemberSheet 로 옮겼다.
 * 권한 없는 사용자에게는 아예 렌더되지 않는다 (숨김 게이팅).
 */
export function DealerPanel({
  snapshot,
  pendingActions,
  selfId,
  runAction,
}: {
  snapshot: RoomSnapshot
  pendingActions: readonly BetActionView[]
  selfId: string
  runAction: RunAction
}) {
  const { d } = useDict()
  const [mode, setMode] = useState<PanelMode>('idle')
  const [winnerId, setWinnerId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [gostop, setGostop] = useState<GostopScoreState>(initialGostopScore)
  const [settleOpen, setSettleOpen] = useState(false)
  /** 무효 확인 대상 — 'current' 진행 중 판, 'last' 마지막으로 끝난 판(승자 오입력 복구). */
  const [voidTarget, setVoidTarget] = useState<'current' | 'last' | null>(null)
  const [voidReason, setVoidReason] = useState<VoidReason>('재경기')
  const [isPending, startTransition] = useTransition()

  const roomId = snapshot.room.id
  const round = snapshot.currentRound
  const isHost = snapshot.members.find((member) => member.userId === selfId)?.role === 'host'
  const players = snapshot.members.filter((member) => member.role !== 'observer')
  const isGostop = snapshot.room.gameType === 'gostop'
  const verifiedFairness =
    snapshot.room.gameType === 'seotda' ? (round?.fairness ?? null) : null
  const verifiedDealReady = verifiedFairness?.phase === 'sealed'
  // 다이/폴드는 그 판의 승자 후보가 아니다. 서버도 endRound에서 재검증하므로, 이 값은
  // 스냅샷이 잠시 오래됐더라도 권한 경계를 대신하지 않는다.
  const eligibleWinnerIds = new Set(
    nonFoldedParticipantIds(
      players.map((member) => member.userId),
      snapshot.actions,
    ),
  )
  const eligiblePlayers = players.filter((member) => eligibleWinnerIds.has(member.userId))
  const foldWinWinner = !isGostop && eligiblePlayers.length === 1 ? eligiblePlayers[0] : null
  const selectedWinnerIsEligible = winnerId !== null && eligibleWinnerIds.has(winnerId)
  /** 승자를 뺀 플레이어 — 고스톱 패자별 박 행과 loserPenalties 페이로드의 대상. */
  const gostopLosers =
    isGostop && winnerId ? players.filter((member) => member.userId !== winnerId) : []
  const betLabels = d.bet[snapshot.room.gameType === 'poker' ? 'poker' : 'seotda']
  const noteExample =
    snapshot.room.gameType === 'seotda'
      ? d.dealer.noteExampleSeotda
      : isGostop
        ? d.dealer.noteExampleGostop
        : d.dealer.noteExamplePoker

  const run = (task: () => Promise<unknown>) => {
    if (isPending) return
    startTransition(async () => {
      await task()
    })
  }

  const nameOf = (userId: string) =>
    snapshot.members.find((member) => member.userId === userId)?.displayName ?? '?'

  const openVoidDialog = (target: 'current' | 'last') => {
    setVoidReason('재경기')
    setVoidTarget(target)
  }

  const confirmVoid = () => {
    const reason = voidReason
    setVoidTarget(null)
    run(() =>
      runAction(
        // voidRound 는 진행 중 판이 없으면 마지막으로 끝난 판을 되돌린다 — 서버가 대상을 판정.
        () => voidRound({ roomId, reason }),
        (data) => ({
          event: 'round.voided',
          payload: { roundId: data.roundId, seq: data.seq, reason },
        }),
      ),
    )
  }

  const finishVerifiedRound = () => {
    if (!round || !verifiedDealReady) return
    run(() =>
      runAction(
        // verified 섯다는 winnerId를 받지 않는다. 서버가 봉인된 덱으로만 승자를 판정한다.
        () => endRound({ roomId }),
        (data) => ({
          event: 'round.ended',
          payload: {
            roundId: round.id,
            seq: data.seq,
            winnerId: data.winnerId,
            pot: data.pot,
          },
        }),
      ),
    )
  }

  return (
    <Panel className="mb-4 space-y-4 border border-accent/20">
      <h2 className="text-sm font-bold text-accent">{d.dealer.title}</h2>

      {/* ── 판 시작/종료 ── */}
      {mode === 'idle' ? (
        <div className="grid grid-cols-2 gap-2">
          {!round ? (
            <>
              <Button
                variant="primary"
                size="lg"
                disabled={isPending}
                onClick={() =>
                  run(() =>
                    runAction(
                      () => startRound(roomId),
                      (data) => ({
                        event: 'round.started',
                        payload: { roundId: data.roundId, seq: data.seq },
                      }),
                    ),
                  )
                }
              >
                ▶ {d.dealer.startRound}
              </Button>
              {snapshot.lastResult ? (
                <Button
                  variant="danger"
                  disabled={isPending}
                  onClick={() => openVoidDialog('last')}
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
                disabled={isPending || pendingActions.length > 0 || Boolean(verifiedFairness && !verifiedDealReady)}
                disabledReason={
                  pendingActions.length > 0
                    ? d.dealer.pendingFirst
                    : verifiedFairness && !verifiedDealReady
                      ? d.fairness.waitForSeeds
                      : undefined
                }
                onClick={() => {
                  if (verifiedFairness) {
                    finishVerifiedRound()
                    return
                  }
                  // 마지막 한 명만 남았다면 다이 승리를 미리 선택해 딜러의 한 단계를 줄인다.
                  setWinnerId(foldWinWinner?.userId ?? null)
                  setNote('')
                  // 배수·박은 판마다 초기화하고 기본 점수는 유지한다 (연속 입력 편의).
                  setGostop((current) => ({ ...initialGostopScore, base: current.base }))
                  setMode('pickWinner')
                }}
              >
                🏁 {d.dealer.endRound}
              </Button>
              <Button
                variant="danger"
                disabled={isPending}
                onClick={() => openVoidDialog('current')}
              >
                {d.dealer.voidRound}
              </Button>
            </>
          )}
          {isHost && !round ? (
            <Button
              variant="surface"
              className="border border-white/10"
              disabled={isPending || snapshot.endedRounds === 0}
              disabledReason={snapshot.endedRounds === 0 ? d.dealer.noEndedRounds : undefined}
              onClick={() => setSettleOpen(true)}
            >
              🧾 {d.dealer.settleSession}
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* ── 승자 선택 ── */}
      {mode === 'pickWinner' && round ? (
        <div className="space-y-2.5">
          <p className="text-sm font-medium">
            {format(d.dealer.pickWinner, { seq: round.seq })}
            {isGostop ? null : (
              <>
                {` · ${d.dealer.potLabel} `}
                <span className="tabular-nums font-bold text-warn">{round.pot.toLocaleString()}</span>
              </>
            )}
          </p>
          {foldWinWinner ? (
            <p className="rounded-md border border-win/30 bg-win/10 px-3 py-2 text-xs text-win">
              {format(d.dealer.foldWinHint, { winner: foldWinWinner.displayName })}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            {eligiblePlayers.map((member) => (
              <Button
                key={member.userId}
                variant={winnerId === member.userId ? 'win' : 'surface'}
                className={winnerId === member.userId ? 'max-w-full' : 'max-w-full border border-white/10'}
                onClick={() => setWinnerId(member.userId)}
              >
                <span className="truncate">{member.displayName}</span>
              </Button>
            ))}
          </div>
          {isGostop ? (
            <GostopScoreForm
              state={gostop}
              onChange={setGostop}
              losers={gostopLosers}
              pointValue={snapshot.room.pointValue}
            />
          ) : null}
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={format(d.dealer.notePlaceholder, { example: noteExample })}
            maxLength={60}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={() => setMode('idle')}>
              {d.common.cancel}
            </Button>
            <Button
              variant="win"
              size="lg"
              disabled={!selectedWinnerIsEligible || isPending}
              disabledReason={!selectedWinnerIsEligible ? d.dealer.pickWinnerFirst : undefined}
              onClick={() => {
                if (!winnerId || !eligibleWinnerIds.has(winnerId)) return
                const roundId = round.id
                const penalties = gostopLoserPenalties(
                  gostop,
                  gostopLosers.map((member) => member.userId),
                )
                run(async () => {
                  const success = await runAction(
                    () =>
                      endRound({
                        roomId,
                        winnerId,
                        note: note.trim() || undefined,
                        // 흔들기·총통 공통 배수는 여기서 미리 곱해 최종 점수로 보낸다.
                        score: isGostop ? gostopEffectiveScore(gostop) : undefined,
                        loserPenalties:
                          isGostop && penalties.length > 0 ? penalties : undefined,
                      }),
                    (data) => ({
                      event: 'round.ended',
                      payload: {
                        roundId,
                        seq: data.seq,
                        winnerId: data.winnerId,
                        pot: data.pot,
                      },
                    }),
                  )
                  if (success) setMode('idle')
                })
              }}
            >
              {d.dealer.confirmWinner}
            </Button>
          </div>
        </div>
      ) : null}

      {/* ── 판 무효 확인 (진행 중 판 · 지난 판 공용) ── */}
      <VoidRoundDialog
        open={voidTarget !== null}
        title={voidTarget === 'last' ? d.dealer.voidLastTitle : d.dealer.voidCurrentTitle}
        body={
          voidTarget === 'last'
            ? format(d.dealer.voidLastBody, { seq: snapshot.lastResult?.seq ?? 0 })
            : d.dealer.voidCurrentBody
        }
        reason={voidReason}
        onReasonChange={setVoidReason}
        onConfirm={confirmVoid}
        onClose={() => setVoidTarget(null)}
      />

      {/* ── 세션 정산 확인 ── */}
      <ConfirmDialog
        open={settleOpen}
        title={d.dealer.settleConfirmTitle}
        body={d.dealer.settleConfirmBody}
        confirmLabel={d.dealer.settleConfirmLabel}
        cancelLabel={d.common.cancel}
        onConfirm={() => {
          setSettleOpen(false)
          run(() => runAction(() => closeRoom(roomId)))
        }}
        onClose={() => setSettleOpen(false)}
      />

      {/* ── 승인 대기열 ── */}
      <PendingApprovalQueue
        pendingActions={pendingActions}
        selfId={selfId}
        runAction={runAction}
        nameOf={nameOf}
        betLabels={betLabels}
      />

      {/* ── 확정 액션 정정 ── */}
      <RevertList snapshot={snapshot} selfId={selfId} runAction={runAction} />

      <p className="text-xs text-muted">{d.dealer.memberActionsHint}</p>
    </Panel>
  )
}
