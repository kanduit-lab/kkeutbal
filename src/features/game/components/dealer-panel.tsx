'use client'

import { useState, useTransition } from 'react'
import { approveBet, rejectBet, revertBet } from '@/features/betting/actions'
import { closeRoom } from '../actions'
import { endRound, startRound, voidRound } from '../round-actions'
import type { BetActionView, RoomSnapshot } from '../types'
import { Button, ConfirmDialog, Input, Panel, Stepper } from '@/components/ui'
import { BET_LABELS, WINNER_NOTE_PLACEHOLDER, type RunAction } from './shared'

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
  const [mode, setMode] = useState<PanelMode>('idle')
  const [winnerId, setWinnerId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [score, setScore] = useState(3)
  const [settleOpen, setSettleOpen] = useState(false)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [isPending, startTransition] = useTransition()

  const roomId = snapshot.room.id
  const round = snapshot.currentRound
  const isHost = snapshot.members.find((member) => member.userId === selfId)?.role === 'host'
  const players = snapshot.members.filter((member) => member.role !== 'observer')
  const isGostop = snapshot.room.gameType === 'gostop'
  const loserCount = winnerId ? Math.max(0, players.length - 1) : 0
  const gostopPay = score * snapshot.room.pointValue

  const run = (task: () => Promise<unknown>) => {
    if (isPending) return
    startTransition(async () => {
      await task()
    })
  }

  const nameOf = (userId: string) =>
    snapshot.members.find((member) => member.userId === userId)?.displayName ?? '?'

  return (
    <Panel className="mb-4 space-y-4 border border-accent/20">
      <h2 className="text-sm font-bold text-accent">딜러 컨트롤</h2>

      {/* ── 판 시작/종료 ── */}
      {mode === 'idle' ? (
        <div className="grid grid-cols-2 gap-2">
          {!round ? (
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
              ▶ 판 시작
            </Button>
          ) : (
            <>
              <Button
                variant="win"
                size="lg"
                disabled={isPending || pendingActions.length > 0}
                disabledReason={
                  pendingActions.length > 0 ? '승인 대기 베팅을 먼저 처리하세요' : undefined
                }
                onClick={() => {
                  setWinnerId(null)
                  setNote('')
                  setMode('pickWinner')
                }}
              >
                🏁 판 종료
              </Button>
              <Button
                variant="danger"
                disabled={isPending}
                onClick={() => run(() => runAction(() => voidRound({ roomId, reason: '재경기' })))}
              >
                판 무효 (재경기)
              </Button>
            </>
          )}
          {isHost && !round ? (
            <Button
              variant="surface"
              className="border border-white/10"
              disabled={isPending || snapshot.endedRounds === 0}
              disabledReason={snapshot.endedRounds === 0 ? '끝난 판이 없습니다' : undefined}
              onClick={() => setSettleOpen(true)}
            >
              🧾 세션 정산
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* ── 승자 선택 ── */}
      {mode === 'pickWinner' && round ? (
        <div className="space-y-2.5">
          <p className="text-sm font-medium">
            {round.seq}판 승자 선택
            {isGostop ? null : (
              <>
                {' · 팟 '}
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
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-sm font-medium">점수</span>
                <Stepper
                  value={score}
                  onChange={setScore}
                  min={1}
                  max={999}
                  ariaLabel="고스톱 점수"
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted">
                × 점당 {snapshot.room.pointValue.toLocaleString()} ={' '}
                <span className="tabular-nums font-bold text-warn">{gostopPay.toLocaleString()}</span>
                /인{loserCount > 0 ? ` · 패자 ${loserCount}명` : ''}
              </p>
            </div>
          ) : null}
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={`족보 메모 (선택, ${WINNER_NOTE_PLACEHOLDER[snapshot.room.gameType]})`}
            maxLength={60}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={() => setMode('idle')}>
              취소
            </Button>
            <Button
              variant="win"
              size="lg"
              disabled={!winnerId || isPending}
              disabledReason={!winnerId ? '승자를 선택하세요' : undefined}
              onClick={() => {
                if (!winnerId) return
                const roundId = round.id
                run(async () => {
                  const success = await runAction(
                    () =>
                      endRound({
                        roomId,
                        winnerId,
                        note: note.trim() || undefined,
                        score: isGostop ? score : undefined,
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
              승자 확정
            </Button>
          </div>
        </div>
      ) : null}

      {/* ── 세션 정산 확인 ── */}
      <ConfirmDialog
        open={settleOpen}
        title="세션을 정산할까요?"
        body="정산하면 이 방에서 더 이상 판을 진행할 수 없습니다. 결과 화면으로 이동합니다."
        confirmLabel="정산"
        onConfirm={() => {
          setSettleOpen(false)
          run(() => runAction(() => closeRoom(roomId)))
        }}
        onClose={() => setSettleOpen(false)}
      />

      {/* ── 승인 대기열 ── */}
      {pendingActions.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-sm font-bold text-warn">승인 대기 {pendingActions.length}건</p>
          {pendingActions.map((action) => (
            <div key={action.id} className="rounded-xl bg-bg-deep/60 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm">
                  <span className="font-medium">{nameOf(action.userId)}</span>{' '}
                  <span className="font-bold">{BET_LABELS[action.action]}</span>{' '}
                  {action.amount > 0 ? (
                    <span className="tabular-nums text-warn">{action.amount.toLocaleString()}</span>
                  ) : null}
                </span>
                <span className="flex gap-1.5">
                  <Button
                    size="sm"
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
                    승인
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={isPending}
                    onClick={() => {
                      setRejectingId(rejectingId === action.id ? null : action.id)
                      setRejectReason('')
                    }}
                  >
                    거절
                  </Button>
                </span>
              </div>
              {rejectingId === action.id ? (
                <div className="mt-2 flex gap-1.5">
                  <Input
                    value={rejectReason}
                    onChange={(event) => setRejectReason(event.target.value)}
                    placeholder="거절 사유 (필수)"
                    maxLength={200}
                    className="min-h-9 text-sm"
                  />
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={isPending || rejectReason.trim().length === 0}
                    disabledReason={rejectReason.trim().length === 0 ? '사유를 입력하세요' : undefined}
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
                    확정
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* ── 확정 액션 정정 ── */}
      <RevertList snapshot={snapshot} selfId={selfId} runAction={runAction} />

      <p className="text-xs text-muted">
        바이인 · 대리 입력 · 역할 변경 · 방장 위임은 테이블의 좌석을 탭하세요
      </p>
    </Panel>
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
  const [isPending, startTransition] = useTransition()
  const accepted = snapshot.actions.filter((action) => action.status === 'accepted').slice(-5)
  if (accepted.length === 0) return null

  const nameOf = (userId: string) =>
    snapshot.members.find((member) => member.userId === userId)?.displayName ?? '?'

  return (
    <details className="rounded-xl bg-bg-deep/60 px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium text-muted">확정 액션 정정</summary>
      <div className="mt-2 space-y-1.5">
        {accepted.map((action) => (
          <div key={action.id} className="flex items-center justify-between text-sm">
            <span>
              #{action.seq} {nameOf(action.userId)} {BET_LABELS[action.action]}{' '}
              {action.amount > 0 ? action.amount.toLocaleString() : ''}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await runAction(
                    () => revertBet({ actionId: action.id, reason: '딜러 정정' }),
                    () => ({
                      event: 'bet.reverted',
                      payload: { actionId: action.id, revertedBy: selfId, reason: '딜러 정정' },
                    }),
                  )
                })
              }
            >
              되돌리기
            </Button>
          </div>
        ))}
      </div>
    </details>
  )
}
