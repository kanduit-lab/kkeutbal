'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { undoLastBuyIn } from '@/features/budget/actions'
import { neededToCall, roundBetState } from '@/features/betting/round-bet-state'
import { format, useDict } from '@/lib/i18n/client'
import { leaveRoom, removeMember, transferHost } from '../member-actions'
import type { MemberView, RoomSnapshot } from '../types'
import { Avatar, Badge, Button, ConfirmDialog, useModalBehavior, useToast } from '@/components/ui'
import type { RunAction } from './shared'
import { StatTile } from './member-sheet-parts'
import { ProxyBetSection } from './member-sheet-proxy-bet'
import { BuyInSection } from './member-sheet-buy-in'
import { RoleSection } from './member-sheet-role'

/**
 * 좌석 탭 → 멤버 시트. 권한별로 노출이 다르다:
 * - 누구나: 멤버 요약 (잔액·손익·바이인)
 * - 딜러·방장: 추가 바이인·지급 취소, 대리 입력 (베팅 게임), 내보내기
 * - 방장: 역할 변경, 방장 위임
 * - 본인 (방장 제외): 방 나가기
 */
export function MemberSheet({
  member,
  snapshot,
  selfId,
  runAction,
  onClose,
}: {
  member: MemberView
  snapshot: RoomSnapshot
  selfId: string
  runAction: RunAction
  onClose: () => void
}) {
  const router = useRouter()
  const { toast } = useToast()
  const { d } = useDict()
  const [isPending, startTransition] = useTransition()
  const startingChips = snapshot.room.startingChips
  const [transferOpen, setTransferOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [undoOpen, setUndoOpen] = useState(false)

  const anyConfirmOpen = transferOpen || removeOpen || leaveOpen || undoOpen
  // 시트 자체의 마운트는 부모(room-client)가 소유한다 — 여기서는 항상 열린 상태다.
  const { panelRef } = useModalBehavior(true, () => {
    // 중첩 확인 다이얼로그가 열려 있으면 Escape 는 그쪽만 닫는다 — 시트까지 닫히면 흐름이 끊긴다.
    if (!anyConfirmOpen) onClose()
  })

  const self = snapshot.members.find((m) => m.userId === selfId)
  const isHost = self?.role === 'host'
  const isDealer = isHost || self?.role === 'dealer'
  const isSelf = member.userId === selfId
  const isBettingGame = snapshot.room.gameType !== 'gostop'
  const labels = d.bet[snapshot.room.gameType === 'poker' ? 'poker' : 'seotda']
  const round = snapshot.currentRound
  const net = member.balance - member.buyInTotal

  const betting = useMemo(() => roundBetState(snapshot.actions), [snapshot.actions])
  const lastBet = betting.currentToCall
  const memberCallNeeded = neededToCall(betting, member.userId)

  const run = (task: () => Promise<boolean>, closeAfter = true) => {
    if (isPending) return
    startTransition(async () => {
      const success = await task()
      if (success && closeAfter) onClose()
    })
  }

  const canProxy = isDealer && isBettingGame && member.role !== 'observer' && Boolean(round)
  const showRemove = isDealer && !isSelf && member.role !== 'host'

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-label={format(d.memberSheet.sheetAria, { name: member.displayName })}
        onClick={onClose}
      >
        <div
          ref={panelRef}
          tabIndex={-1}
          className="lacquer max-h-[88dvh] w-full max-w-md space-y-4 overflow-y-auto overscroll-contain rounded-t-3xl p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] focus:outline-none sm:rounded-3xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mx-auto h-1 w-10 rounded-full bg-white/15 sm:hidden" aria-hidden />

          <div className="flex items-center gap-3.5">
            <Avatar name={member.displayName} url={member.avatarUrl} size={60} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-xl font-bold">
                <span className="truncate">{member.displayName}</span>
                {member.role !== 'player' ? (
                  <Badge tone="accent">
                    {member.role === 'host'
                      ? d.roles.host
                      : member.role === 'dealer'
                        ? d.roles.dealer
                        : d.roles.observerShort}
                  </Badge>
                ) : null}
                {isSelf ? <Badge tone="muted">{d.common.me}</Badge> : null}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <StatTile
              label={d.memberSheet.statBalance}
              value={member.balance.toLocaleString()}
              valueClass="gilt"
            />
            <StatTile
              label={d.memberSheet.statNet}
              value={`${net >= 0 ? '+' : ''}${net.toLocaleString()}`}
              valueClass={net >= 0 ? 'text-win' : 'text-accent'}
            />
            <StatTile label={d.memberSheet.statBuyIn} value={member.buyInTotal.toLocaleString()} />
          </div>

          {canProxy ? (
            <ProxyBetSection
              roomId={snapshot.room.id}
              memberId={member.userId}
              memberBalance={member.balance}
              baseBet={snapshot.room.baseBet}
              labels={labels}
              lastBet={lastBet}
              callNeeded={memberCallNeeded}
              isPending={isPending}
              run={run}
              runAction={runAction}
            />
          ) : null}

          {isDealer ? (
            <BuyInSection
              roomId={snapshot.room.id}
              memberId={member.userId}
              memberBuyInTotal={member.buyInTotal}
              startingChips={startingChips}
              baseBet={snapshot.room.baseBet}
              isPending={isPending}
              run={run}
              runAction={runAction}
              onUndoRequest={() => setUndoOpen(true)}
            />
          ) : null}

          {isHost && !isSelf && member.role !== 'host' ? (
            <RoleSection
              roomId={snapshot.room.id}
              memberId={member.userId}
              memberRole={member.role}
              isPending={isPending}
              run={run}
              runAction={runAction}
              onTransferRequest={() => setTransferOpen(true)}
            />
          ) : null}

          {showRemove ? (
            <Button
              variant="danger"
              className="w-full"
              disabled={isPending}
              onClick={() => setRemoveOpen(true)}
            >
              🚪 {d.memberSheet.remove}
            </Button>
          ) : null}

          {isSelf ? (
            <Button
              variant="danger"
              className="w-full"
              disabled={isPending || isHost}
              disabledReason={isHost ? d.memberSheet.hostCantLeave : undefined}
              onClick={() => setLeaveOpen(true)}
            >
              🚪 {d.memberSheet.leave}
            </Button>
          ) : null}

          <Button variant="ghost" className="w-full" onClick={onClose}>
            {d.common.close}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={transferOpen}
        title={format(d.memberSheet.transferConfirmTitle, { name: member.displayName })}
        body={d.memberSheet.transferConfirmBody}
        confirmLabel={d.memberSheet.transferConfirmLabel}
        cancelLabel={d.common.cancel}
        tone="danger"
        onConfirm={() => {
          setTransferOpen(false)
          run(() =>
            runAction(
              () => transferHost({ roomId: snapshot.room.id, targetUserId: member.userId }),
              () => ({
                event: 'member.role_changed',
                payload: { userId: member.userId, role: 'host' },
              }),
            ),
          )
        }}
        onClose={() => setTransferOpen(false)}
      />

      <ConfirmDialog
        open={removeOpen}
        title={format(d.memberSheet.removeConfirmTitle, { name: member.displayName })}
        body={d.memberSheet.removeConfirmBody}
        confirmLabel={d.memberSheet.remove}
        cancelLabel={d.common.cancel}
        tone="danger"
        onConfirm={() => {
          setRemoveOpen(false)
          run(() =>
            runAction(
              () => removeMember({ roomId: snapshot.room.id, targetUserId: member.userId }),
              () => ({ event: 'member.left', payload: { userId: member.userId } }),
            ),
          )
        }}
        onClose={() => setRemoveOpen(false)}
      />

      <ConfirmDialog
        open={leaveOpen}
        title={d.memberSheet.leaveConfirmTitle}
        body={d.memberSheet.leaveConfirmBody}
        confirmLabel={d.memberSheet.leaveConfirmLabel}
        cancelLabel={d.common.cancel}
        tone="danger"
        onConfirm={() => {
          setLeaveOpen(false)
          run(async () => {
            const success = await runAction(
              () => leaveRoom({ roomId: snapshot.room.id }),
              () => ({ event: 'member.left', payload: { userId: selfId } }),
            )
            // 나간 뒤에는 이 방 스냅샷을 더 읽을 수 없다 — 홈(내 방 목록)으로 즉시 이동한다.
            if (success) router.push('/')
            return success
          })
        }}
        onClose={() => setLeaveOpen(false)}
      />

      <ConfirmDialog
        open={undoOpen}
        title={format(d.memberSheet.undoConfirmTitle, { name: member.displayName })}
        body={d.memberSheet.undoConfirmBody}
        confirmLabel={d.memberSheet.undoConfirmLabel}
        cancelLabel={d.common.cancel}
        tone="danger"
        onConfirm={() => {
          setUndoOpen(false)
          run(
            () =>
              runAction(
                () => undoLastBuyIn({ roomId: snapshot.room.id, targetUserId: member.userId }),
                (data) => {
                  // 취소된 실제 금액은 서버 응답에서만 안다 — 성공 토스트로 알려준다.
                  toast(
                    format(d.memberSheet.undoneToast, { n: data.amount.toLocaleString() }),
                    'success',
                  )
                },
              ),
            // 시트를 열어 둬 잔액이 줄어든 것을 바로 확인하게 한다.
            false,
          )
        }}
        onClose={() => setUndoOpen(false)}
      />
    </>
  )
}
