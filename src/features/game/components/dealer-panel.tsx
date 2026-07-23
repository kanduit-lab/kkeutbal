'use client'

import { useState, useTransition } from 'react'
import { approveBet, rejectBet, revertBet } from '@/features/betting/actions'
import { format, useDict } from '@/lib/i18n/client'
import { closeRoom } from '../actions'
import { endRound, startRound, voidRound } from '../round-actions'
import type { BetActionView, RoomSnapshot } from '../types'
import { Button, ConfirmDialog, Input, Panel, useModalBehavior } from '@/components/ui'
import type { RunAction } from './shared'
import {
  GostopScoreForm,
  gostopEffectiveScore,
  gostopLoserPenalties,
  initialGostopScore,
  type GostopScoreState,
} from './gostop-score-form'

type PanelMode = 'idle' | 'pickWinner'

/**
 * 무효 사유 프리셋 — value 는 서버 voidRound reason 과 round.voided 브로드캐스트에
 * 실리는 정본(한국어) 값, labelKey 는 로케일별 표시용. 저장·중계되는 값은 보는 사람의
 * 로케일과 무관해야 하므로 분리한다.
 */
const VOID_REASONS = [
  { value: '재경기', labelKey: 'voidReasonRematch' },
  { value: '오입력', labelKey: 'voidReasonMisentry' },
  { value: '패 노출', labelKey: 'voidReasonExposed' },
] as const
type VoidReason = (typeof VOID_REASONS)[number]['value']

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
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [isPending, startTransition] = useTransition()

  const roomId = snapshot.room.id
  const round = snapshot.currentRound
  const isHost = snapshot.members.find((member) => member.userId === selfId)?.role === 'host'
  const players = snapshot.members.filter((member) => member.role !== 'observer')
  const isGostop = snapshot.room.gameType === 'gostop'
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
                disabled={isPending || pendingActions.length > 0}
                disabledReason={pendingActions.length > 0 ? d.dealer.pendingFirst : undefined}
                onClick={() => {
                  setWinnerId(null)
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
          <div className="grid grid-cols-2 gap-2">
            {players.map((member) => (
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
              disabled={!winnerId || isPending}
              disabledReason={!winnerId ? d.dealer.pickWinnerFirst : undefined}
              onClick={() => {
                if (!winnerId) return
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
      {pendingActions.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-sm font-bold text-warn">
            {format(d.dealer.pendingCount, { n: pendingActions.length })}
          </p>
          {pendingActions.map((action) => (
            <div key={action.id} className="rounded-xl bg-bg-deep/60 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm">
                  <span className="font-medium">{nameOf(action.userId)}</span>{' '}
                  <span className="font-bold">{betLabels[action.action]}</span>{' '}
                  {action.amount > 0 ? (
                    <span className="tabular-nums text-warn">{action.amount.toLocaleString()}</span>
                  ) : null}
                </span>
                <span className="flex gap-1.5">
                  <Button
                    size="md"
                    variant="win"
                    disabled={isPending}
                    onClick={() =>
                      run(() =>
                        runAction(
                          () => approveBet({ actionId: action.id }),
                          () => ({
                            event: 'bet.approved',
                            payload: { actionId: action.id, approvedBy: selfId },
                          }),
                        ),
                      )
                    }
                  >
                    {d.dealer.approve}
                  </Button>
                  <Button
                    size="md"
                    variant="danger"
                    disabled={isPending}
                    onClick={() => {
                      setRejectingId(rejectingId === action.id ? null : action.id)
                      setRejectReason('')
                    }}
                  >
                    {d.dealer.reject}
                  </Button>
                </span>
              </div>
              {rejectingId === action.id ? (
                <div className="mt-2 flex gap-1.5">
                  <Input
                    value={rejectReason}
                    onChange={(event) => setRejectReason(event.target.value)}
                    placeholder={d.dealer.rejectReasonPlaceholder}
                    maxLength={200}
                    className="min-h-11 text-base"
                  />
                  <Button
                    size="md"
                    variant="danger"
                    disabled={isPending || rejectReason.trim().length === 0}
                    disabledReason={
                      rejectReason.trim().length === 0 ? d.dealer.reasonRequired : undefined
                    }
                    onClick={() =>
                      run(async () => {
                        const reason = rejectReason.trim()
                        const success = await runAction(
                          () => rejectBet({ actionId: action.id, reason }),
                          () => ({
                            event: 'bet.rejected',
                            payload: { actionId: action.id, rejectedBy: selfId, reason },
                          }),
                        )
                        if (success) setRejectingId(null)
                      })
                    }
                  >
                    {d.common.confirm}
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* ── 확정 액션 정정 ── */}
      <RevertList snapshot={snapshot} selfId={selfId} runAction={runAction} />

      <p className="text-xs text-muted">{d.dealer.memberActionsHint}</p>
    </Panel>
  )
}

/**
 * 판 무효 확인 다이얼로그 — ConfirmDialog 는 본문 슬롯이 없어 같은 레이아웃으로 별도 구현.
 * 사유 칩(재경기·오입력·패 노출)을 골라 확정한다. 기본값은 재경기.
 */
function VoidRoundDialog({
  open,
  title,
  body,
  reason,
  onReasonChange,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  body: string
  reason: VoidReason
  onReasonChange: (reason: VoidReason) => void
  onConfirm: () => void
  onClose: () => void
}) {
  const { d } = useDict()
  const panelRef = useModalBehavior(open, onClose)
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="lacquer w-full max-w-sm rounded-2xl p-5 focus:outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="font-bold">{title}</p>
        <p className="mt-1.5 text-sm text-muted">{body}</p>
        <div
          className="mt-3 grid grid-cols-3 gap-2"
          role="group"
          aria-label={d.dealer.voidReasonAria}
        >
          {VOID_REASONS.map((item) => (
            <Button
              key={item.value}
              variant={reason === item.value ? 'primary' : 'surface'}
              className={reason === item.value ? undefined : 'border border-white/10'}
              pressed={reason === item.value}
              onClick={() => onReasonChange(item.value)}
            >
              {d.dealer[item.labelKey]}
            </Button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={onClose}>
            {d.common.cancel}
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {d.dealer.voidConfirm}
          </Button>
        </div>
      </div>
    </div>
  )
}

function RevertList({
  snapshot,
  selfId,
  runAction,
}: {
  snapshot: RoomSnapshot
  selfId: string
  runAction: RunAction
}) {
  const { d } = useDict()
  const [isPending, startTransition] = useTransition()
  const [revertTarget, setRevertTarget] = useState<BetActionView | null>(null)
  const accepted = snapshot.actions.filter((action) => action.status === 'accepted').slice(-5)
  if (accepted.length === 0) return null

  const betLabels = d.bet[snapshot.room.gameType === 'poker' ? 'poker' : 'seotda']
  const nameOf = (userId: string) =>
    snapshot.members.find((member) => member.userId === userId)?.displayName ?? '?'

  const revertTitle = revertTarget
    ? format(d.dealer.revertConfirmTitle, {
        target: format(d.dealer.revertTarget, {
          name: nameOf(revertTarget.userId),
          label: betLabels[revertTarget.action],
          amount: revertTarget.amount > 0 ? revertTarget.amount.toLocaleString() : '',
        }).trim(),
      })
    : ''

  return (
    <>
      <details className="rounded-xl bg-bg-deep/60 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-muted">
          {d.dealer.revertSection}
        </summary>
        <div className="mt-2 space-y-1.5">
          {accepted.map((action) => (
            <div key={action.id} className="flex items-center justify-between text-sm">
              <span>
                #{action.seq} {nameOf(action.userId)} {betLabels[action.action]}{' '}
                {action.amount > 0 ? action.amount.toLocaleString() : ''}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={isPending}
                onClick={() => setRevertTarget(action)}
              >
                {d.dealer.revert}
              </Button>
            </div>
          ))}
        </div>
      </details>
      <ConfirmDialog
        open={revertTarget !== null}
        title={revertTitle}
        body={d.dealer.revertConfirmBody}
        confirmLabel={d.dealer.revert}
        cancelLabel={d.common.cancel}
        onConfirm={() => {
          const target = revertTarget
          setRevertTarget(null)
          if (!target || isPending) return
          startTransition(async () => {
            await runAction(
              // reason 은 원장·브로드캐스트에 저장되는 정본 값 — 로케일과 무관하게 한국어 유지.
              () => revertBet({ actionId: target.id, reason: '딜러 정정' }),
              () => ({
                event: 'bet.reverted',
                payload: { actionId: target.id, revertedBy: selfId, reason: '딜러 정정' },
              }),
            )
          })
        }}
        onClose={() => setRevertTarget(null)}
      />
    </>
  )
}
