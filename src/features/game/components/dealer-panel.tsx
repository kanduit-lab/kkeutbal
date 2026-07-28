'use client'

import { useState, useTransition } from 'react'
import { format, useDict } from '@/lib/i18n/client'
import { closeRoom } from '../actions'
import { endRound, startRound, voidRound } from '../round-actions'
import type { BetActionView, RoomSnapshot } from '../types'
import { Button, ConfirmDialog, Input, Panel } from '@/components/ui'
import { nonFoldedParticipantIds, VOID_REASONS, type RunAction, type VoidReason } from './shared'
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

type DealerSlot = 'start' | 'end' | 'void' | 'settle' | 'confirmWinner'

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
  const [mode, setMode] = useState<PanelMode>('idle')
  const [winnerId, setWinnerId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [gostop, setGostop] = useState<GostopScoreState>(initialGostopScore)
  const [settleOpen, setSettleOpen] = useState(false)

  const [voidTarget, setVoidTarget] = useState<'current' | 'last' | null>(null)
  const [voidReason, setVoidReason] = useState<VoidReason>('재경기')
  const [isPending, startTransition] = useTransition()

  const [firingSlot, setFiringSlot] = useState<DealerSlot | null>(null)

  const roomId = snapshot.room.id
  const round = snapshot.currentRound
  const isHost = snapshot.members.find((member) => member.userId === selfId)?.role === 'host'
  const players = snapshot.members.filter((member) => member.role !== 'observer')
  const isGostop = snapshot.room.gameType === 'gostop'
  const verifiedFairness = snapshot.room.gameType === 'seotda' ? (round?.fairness ?? null) : null
  const verifiedDealReady = verifiedFairness?.phase === 'sealed'

  const eligibleWinnerIds = new Set(
    nonFoldedParticipantIds(
      players.map((member) => member.userId),
      snapshot.actions,
    ),
  )
  const eligiblePlayers = players.filter((member) => eligibleWinnerIds.has(member.userId))
  const foldWinWinner = !isGostop && eligiblePlayers.length === 1 ? eligiblePlayers[0] : null
  const selectedWinnerIsEligible = winnerId !== null && eligibleWinnerIds.has(winnerId)

  const gostopLosers =
    isGostop && winnerId ? players.filter((member) => member.userId !== winnerId) : []
  const betLabels = d.bet[snapshot.room.gameType === 'poker' ? 'poker' : 'seotda']
  const noteExample =
    snapshot.room.gameType === 'seotda'
      ? d.dealer.noteExampleSeotda
      : isGostop
        ? d.dealer.noteExampleGostop
        : d.dealer.noteExamplePoker

  const run = (slot: DealerSlot, task: () => Promise<unknown>) => {
    if (isPending) return
    setFiringSlot(slot)
    startTransition(async () => {
      try {
        await task()
      } finally {
        setFiringSlot(null)
      }
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
    run('void', () =>
      runAction(
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
    run('end', () =>
      runAction(
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
      {mode === 'idle' ? (
        <div className="grid grid-cols-2 gap-2">
          {!round ? (
            <>
              <Button
                variant="primary"
                size="lg"
                loading={firingSlot === 'start'}
                loadingLabel={d.ui.processing}
                disabled={isPending || staleReason !== null}
                disabledReason={staleReason ?? undefined}
                onClick={() =>
                  run('start', () =>
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
                  loading={firingSlot === 'void'}
                  loadingLabel={d.ui.processing}
                  disabled={isPending || staleReason !== null}
                  disabledReason={staleReason ?? undefined}
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
                loading={firingSlot === 'end'}
                loadingLabel={d.ui.processing}
                disabled={
                  isPending ||
                  pendingActions.length > 0 ||
                  staleReason !== null ||
                  Boolean(verifiedFairness && !verifiedDealReady)
                }
                disabledReason={
                  pendingActions.length > 0
                    ? d.dealer.pendingFirst
                    : (staleReason ??
                      (verifiedFairness && !verifiedDealReady
                        ? d.fairness.waitForSeeds
                        : undefined))
                }
                onClick={() => {
                  if (verifiedFairness) {
                    finishVerifiedRound()
                    return
                  }

                  setWinnerId(foldWinWinner?.userId ?? null)
                  setNote('')

                  setGostop((current) => ({ ...initialGostopScore, base: current.base }))
                  setMode('pickWinner')
                }}
              >
                🏁 {d.dealer.endRound}
              </Button>
              <Button
                variant="danger"
                loading={firingSlot === 'void'}
                loadingLabel={d.ui.processing}
                disabled={isPending || staleReason !== null}
                disabledReason={staleReason ?? undefined}
                onClick={() => openVoidDialog('current')}
              >
                {d.dealer.voidRound}
              </Button>
            </>
          )}
          {isHost && !round ? (
            <Button
              variant="outline"
              loading={firingSlot === 'settle'}
              loadingLabel={d.ui.processing}
              disabled={isPending || snapshot.endedRounds === 0 || staleReason !== null}
              disabledReason={
                snapshot.endedRounds === 0 ? d.dealer.noEndedRounds : (staleReason ?? undefined)
              }
              onClick={() => setSettleOpen(true)}
            >
              🧾 {d.dealer.settleSession}
            </Button>
          ) : null}
        </div>
      ) : null}
      {mode === 'pickWinner' && round ? (
        <div className="space-y-2.5">
          <p className="text-sm font-medium">
            {format(d.dealer.pickWinner, { seq: round.seq })}
            {isGostop ? null : (
              <>
                {` · ${d.dealer.potLabel} `}
                <span className="tabular-nums font-bold text-warn">
                  {round.pot.toLocaleString()}
                </span>
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
                variant={winnerId === member.userId ? 'win' : 'outline'}
                pressed={winnerId === member.userId}
                className="max-w-full"
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
            <Button variant="ghost" disabled={isPending} onClick={() => setMode('idle')}>
              {d.common.cancel}
            </Button>
            <Button
              variant="win"
              size="lg"
              loading={firingSlot === 'confirmWinner'}
              loadingLabel={d.ui.processing}
              disabled={isPending || !selectedWinnerIsEligible || staleReason !== null}
              disabledReason={
                !selectedWinnerIsEligible ? d.dealer.pickWinnerFirst : (staleReason ?? undefined)
              }
              onClick={() => {
                if (!winnerId || !eligibleWinnerIds.has(winnerId)) return
                const roundId = round.id
                const penalties = gostopLoserPenalties(
                  gostop,
                  gostopLosers.map((member) => member.userId),
                )
                run('confirmWinner', async () => {
                  const success = await runAction(
                    () =>
                      endRound({
                        roomId,
                        winnerId,
                        note: note.trim() || undefined,
                        score: isGostop ? gostopEffectiveScore(gostop) : undefined,
                        loserPenalties: isGostop && penalties.length > 0 ? penalties : undefined,
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

      <ConfirmDialog
        open={voidTarget !== null}
        tone="danger"
        title={voidTarget === 'last' ? d.dealer.voidLastTitle : d.dealer.voidCurrentTitle}
        body={
          voidTarget === 'last'
            ? format(d.dealer.voidLastBody, { seq: snapshot.lastResult?.seq ?? 0 })
            : d.dealer.voidCurrentBody
        }
        confirmLabel={d.dealer.voidConfirm}
        cancelLabel={d.common.cancel}
        onConfirm={confirmVoid}
        onClose={() => setVoidTarget(null)}
      >
        <div className="grid grid-cols-3 gap-2" role="group" aria-label={d.dealer.voidReasonAria}>
          {VOID_REASONS.map((item) => (
            <Button
              key={item.value}
              size="sm"
              selected={voidReason === item.value}
              onClick={() => setVoidReason(item.value)}
            >
              {d.dealer[item.labelKey]}
            </Button>
          ))}
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={settleOpen}
        title={d.dealer.settleConfirmTitle}
        body={d.dealer.settleConfirmBody}
        confirmLabel={d.dealer.settleConfirmLabel}
        cancelLabel={d.common.cancel}
        onConfirm={() => {
          setSettleOpen(false)
          run('settle', () => runAction(() => closeRoom(roomId)))
        }}
        onClose={() => setSettleOpen(false)}
      />
      <PendingApprovalQueue
        pendingActions={pendingActions}
        selfId={selfId}
        runAction={runAction}
        nameOf={nameOf}
        betLabels={betLabels}
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