'use client'

import { useState, useTransition } from 'react'
import { approveBet, placeBet, rejectBet, revertBet } from '@/features/betting/actions'
import { addBuyIn } from '@/features/budget/actions'
import { closeRoom, endRound, setMemberRole, startRound, voidRound } from '../actions'
import type { BetActionKind, BetActionView, RoomSnapshot } from '../types'
import { Button, Input, Panel } from '@/components/ui'
import { BET_LABELS, WINNER_NOTE_PLACEHOLDER, type RunAction } from './shared'

type PanelMode = 'idle' | 'pickWinner'

/** 딜러/방장 전용 컨트롤. 권한 없는 사용자에게는 아예 렌더되지 않는다 (숨김 게이팅). */
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
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [isPending, startTransition] = useTransition()

  const roomId = snapshot.room.id
  const round = snapshot.currentRound
  const isHost = snapshot.members.find((member) => member.userId === selfId)?.role === 'host'
  const players = snapshot.members.filter((member) => member.role !== 'observer')

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
              onClick={() => {
                if (window.confirm('세션을 정산할까요? 정산 후에는 판을 다시 진행할 수 없어요.')) {
                  run(() => runAction(() => closeRoom(roomId)))
                }
              }}
            >
              🧾 세션 정산
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* ── 승자 선택 ── */}
      {mode === 'pickWinner' && round ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {round.seq}판 승자 선택 · 팟{' '}
            <span className="tabular-nums font-bold text-warn">{round.pot.toLocaleString()}</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            {players.map((member) => (
              <Button
                key={member.userId}
                size="sm"
                variant={winnerId === member.userId ? 'win' : 'surface'}
                className={winnerId === member.userId ? '' : 'border border-white/10'}
                onClick={() => setWinnerId(member.userId)}
              >
                {member.displayName}
              </Button>
            ))}
          </div>
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
              disabled={!winnerId || isPending}
              disabledReason={!winnerId ? '승자를 선택하세요' : undefined}
              onClick={() => {
                if (!winnerId) return
                const roundId = round.id
                run(async () => {
                  const success = await runAction(
                    () =>
                      endRound({ roomId, winnerId, note: note.trim() || undefined }),
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

      {/* ── 부가 도구 ── */}
      <details className="rounded-xl bg-bg-deep/60 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-muted">
          정정 · 바이인 · 대리 입력 · 역할
        </summary>
        <div className="mt-3 space-y-4">
          <RevertList snapshot={snapshot} selfId={selfId} runAction={runAction} />
          <BuyInForm snapshot={snapshot} runAction={runAction} />
          <ProxyBetForm snapshot={snapshot} runAction={runAction} />
          {isHost ? <RoleForm snapshot={snapshot} selfId={selfId} runAction={runAction} /> : null}
        </div>
      </details>
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
    <div className="space-y-1.5">
      <p className="text-xs font-bold text-muted">확정 액션 정정 (되돌리기)</p>
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
  )
}

function BuyInForm({ snapshot, runAction }: { snapshot: RoomSnapshot; runAction: RunAction }) {
  const [target, setTarget] = useState('')
  const [amount, setAmount] = useState(snapshot.room.startingChips)
  const [isPending, startTransition] = useTransition()

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-bold text-muted">추가 바이인</p>
      <div className="flex gap-1.5">
        <select
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          className="min-h-10 flex-1 rounded-lg border border-gold/15 bg-bg-deep/60 px-2 text-sm"
          aria-label="바이인 대상"
        >
          <option value="">대상 선택</option>
          {snapshot.members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.displayName}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          value={amount}
          onChange={(event) => setAmount(Math.max(1, Number(event.target.value) || 1))}
          className="min-h-10 w-20 rounded-lg border border-gold/15 bg-bg-deep/60 px-2 text-center text-sm tabular-nums"
          aria-label="바이인 금액"
        />
        <Button
          size="sm"
          variant="surface"
          className="border border-white/10"
          disabled={isPending || !target}
          disabledReason={!target ? '대상을 선택하세요' : undefined}
          onClick={() =>
            startTransition(async () => {
              await runAction(() =>
                addBuyIn({ roomId: snapshot.room.id, amount, targetUserId: target }),
              )
            })
          }
        >
          추가
        </Button>
      </div>
    </div>
  )
}

function ProxyBetForm({ snapshot, runAction }: { snapshot: RoomSnapshot; runAction: RunAction }) {
  const [target, setTarget] = useState('')
  const [action, setAction] = useState<BetActionKind>('call')
  const [amount, setAmount] = useState(10)
  const [isPending, startTransition] = useTransition()

  const movesChips = action === 'call' || action === 'raise' || action === 'allin'

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-bold text-muted">대리 입력 (폰 없는 참가자)</p>
      <div className="flex flex-wrap gap-1.5">
        <select
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          className="min-h-10 flex-1 rounded-lg border border-gold/15 bg-bg-deep/60 px-2 text-sm"
          aria-label="대리 입력 대상"
        >
          <option value="">대상 선택</option>
          {snapshot.members
            .filter((member) => member.role !== 'observer')
            .map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.displayName}
              </option>
            ))}
        </select>
        <select
          value={action}
          onChange={(event) => setAction(event.target.value as BetActionKind)}
          className="min-h-10 rounded-lg border border-gold/15 bg-bg-deep/60 px-2 text-sm"
          aria-label="액션"
        >
          {(Object.keys(BET_LABELS) as BetActionKind[]).map((kind) => (
            <option key={kind} value={kind}>
              {BET_LABELS[kind]}
            </option>
          ))}
        </select>
        {movesChips ? (
          <input
            type="number"
            min={1}
            value={amount}
            onChange={(event) => setAmount(Math.max(1, Number(event.target.value) || 1))}
            className="min-h-10 w-20 rounded-lg border border-gold/15 bg-bg-deep/60 px-2 text-center text-sm tabular-nums"
            aria-label="금액"
          />
        ) : null}
        <Button
          size="sm"
          variant="surface"
          className="border border-white/10"
          disabled={isPending || !target || !snapshot.currentRound}
          disabledReason={
            !snapshot.currentRound ? '진행 중인 판이 없습니다' : !target ? '대상을 선택하세요' : undefined
          }
          onClick={() =>
            startTransition(async () => {
              await runAction(
                () =>
                  placeBet({
                    actionId: crypto.randomUUID(),
                    roomId: snapshot.room.id,
                    action,
                    amount: movesChips ? amount : 0,
                    targetUserId: target,
                  }),
                (data) => ({
                  event: 'bet.placed',
                  payload: {
                    actionId: data.action.id,
                    roundId: data.action.roundId,
                    action: data.action.action,
                    amount: data.action.amount,
                    seq: data.action.seq,
                  },
                }),
              )
            })
          }
        >
          제출
        </Button>
      </div>
    </div>
  )
}

function RoleForm({
  snapshot,
  selfId,
  runAction,
}: {
  snapshot: RoomSnapshot
  selfId: string
  runAction: RunAction
}) {
  const [target, setTarget] = useState('')
  const [role, setRole] = useState<'dealer' | 'player' | 'observer'>('dealer')
  const [isPending, startTransition] = useTransition()

  const candidates = snapshot.members.filter((member) => member.userId !== selfId)
  if (candidates.length === 0) return null

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-bold text-muted">역할 변경 (딜러 위임 등)</p>
      <div className="flex gap-1.5">
        <select
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          className="min-h-10 flex-1 rounded-lg border border-gold/15 bg-bg-deep/60 px-2 text-sm"
          aria-label="역할 변경 대상"
        >
          <option value="">대상 선택</option>
          {candidates.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.displayName} ({member.role})
            </option>
          ))}
        </select>
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as typeof role)}
          className="min-h-10 rounded-lg border border-gold/15 bg-bg-deep/60 px-2 text-sm"
          aria-label="새 역할"
        >
          <option value="dealer">딜러</option>
          <option value="player">플레이어</option>
          <option value="observer">관전자</option>
        </select>
        <Button
          size="sm"
          variant="surface"
          className="border border-white/10"
          disabled={isPending || !target}
          disabledReason={!target ? '대상을 선택하세요' : undefined}
          onClick={() =>
            startTransition(async () => {
              await runAction(
                () =>
                  setMemberRole({ roomId: snapshot.room.id, targetUserId: target, role }),
                () => ({
                  event: 'member.role_changed',
                  payload: { userId: target, role },
                }),
              )
            })
          }
        >
          변경
        </Button>
      </div>
    </div>
  )
}
