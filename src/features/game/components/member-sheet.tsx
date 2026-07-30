'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { undoLastBuyIn } from '@/features/budget/actions'
import { neededToCall, roundBetState } from '@/features/betting/round-bet-state'
import { format, useDict } from '@/lib/i18n/client'
import { leaveRoom, removeMember, transferHost } from '../member-actions'
import { nextActorId } from '../turn-order'
import type { MemberView, RoomSnapshot } from '../types'
import { Avatar, Badge, Button, ConfirmDialog, Sheet, StatTile, useToast } from '@/components/ui'
import { formatChips, lastAcceptedByUser, type RunAction } from './shared'
import { proxyBlockReason, selfBlockReason } from './member-sheet-gating'
import { ProxyBetSection, ProxyBlockedNotice } from './member-sheet-proxy-bet'
import { BuyInSection } from './member-sheet-buy-in'
import { RoleSection } from './member-sheet-role'
import { SelfBetNotice } from './member-sheet-self-notice'

export function MemberSheet({
  open,
  member,
  snapshot,
  selfId,
  runAction,
  onClose,
}: {
  open: boolean
  member: MemberView
  snapshot: RoomSnapshot
  selfId: string
  runAction: RunAction
  onClose: () => void
}) {
  const router = useRouter()
  const { toast } = useToast()
  const { d, locale } = useDict()
  const [isPending, startTransition] = useTransition()
  const startingChips = snapshot.room.startingChips
  const [transferOpen, setTransferOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [undoOpen, setUndoOpen] = useState(false)

  const anyConfirmOpen = transferOpen || removeOpen || leaveOpen || undoOpen

  const requestClose = () => {
    if (!anyConfirmOpen) onClose()
  }

  const self = snapshot.members.find((m) => m.userId === selfId)
  const isHost = self?.role === 'host'
  const isDealer = isHost || self?.role === 'dealer'
  const isSelf = member.userId === selfId
  const isBettingGame = snapshot.room.gameType !== 'gostop'
  const labels = d.bet[snapshot.room.gameType === 'poker' ? 'poker' : 'seotda']
  const round = snapshot.currentRound
  const hasRound = Boolean(round)
  const net = member.balance - member.buyInTotal

  const betting = useMemo(() => roundBetState(snapshot.actions), [snapshot.actions])
  const lastBet = betting.currentToCall
  const memberCallNeeded = neededToCall(betting, member.userId)

  // 좌석 탭 = "이 사람에게 지금 뭘 할 수 있나"가 핵심 질문. 대신 베팅(canProxy)이 막혀
  // 있으면 숨기지 않고 왜 막혔는지 보여준다 (ui-permission-gating: hide 대신 이유 노출).
  const proxyReason = isSelf
    ? null
    : proxyBlockReason({ isBettingGame, isDealer, targetRole: member.role, hasRound })
  const canProxy = !isSelf && proxyReason === null

  const selfReason = isSelf
    ? selfBlockReason({ isBettingGame, selfRole: member.role, hasRound })
    : null

  const showRemove = isDealer && !isSelf && member.role !== 'host'

  const lastAcceptedMap = useMemo(() => lastAcceptedByUser(snapshot.actions), [snapshot.actions])
  const memberLastAction = lastAcceptedMap.get(member.userId) ?? null

  // 차례는 좌석 순서 순수 함수 한 곳에서만 계산한다 — 서버(`betting/actions.ts`)와
  // 좌석 강조(`game-table.tsx`)가 쓰는 바로 그 함수다. 대리 베팅을 눌러도 차례가
  // 아니면 서버가 거절하므로, 누를 수 있는지를 여기서 미리 알려준다.
  const participantIds = useMemo(
    () => snapshot.members.filter((m) => m.role !== 'observer').map((m) => m.userId),
    [snapshot.members],
  )
  const isMembersTurn =
    isBettingGame && hasRound && nextActorId(participantIds, snapshot.actions) === member.userId

  const statusLabel = !isBettingGame
    ? null
    : member.role === 'observer'
      ? d.memberSheet.statusObserving
      : isMembersTurn
        ? d.memberSheet.statusTheirTurn
        : memberLastAction
          ? `${labels[memberLastAction.action]}${
              memberLastAction.amount > 0 ? ` ${formatChips(memberLastAction.amount, locale)}` : ''
            }`
          : d.memberSheet.statusNoAction
  const subtitle = [formatChips(member.balance, locale), statusLabel].filter(Boolean).join(' · ')

  const run = (task: () => Promise<boolean>, closeAfter = true) => {
    if (isPending) return
    startTransition(async () => {
      const success = await task()
      if (success && closeAfter) onClose()
    })
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={requestClose}
        ariaLabel={format(d.memberSheet.sheetAria, { name: member.displayName })}
        className="space-y-4 sm:rounded-3xl"
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
            <p className="truncate text-sm text-muted">{subtitle}</p>
          </div>
        </div>

        {isSelf ? (
          <SelfBetNotice reason={selfReason} showDealerHint={isDealer} onGoToActionBar={onClose} />
        ) : canProxy ? (
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
        ) : (
          proxyReason !== null && <ProxyBlockedNotice reason={proxyReason} />
        )}

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
            aria-haspopup="dialog"
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

        <div className="grid grid-cols-3 gap-2">
          <StatTile label={d.memberSheet.statBalance} valueClass="gilt text-lg">
            {member.balance.toLocaleString()}
          </StatTile>
          <StatTile
            label={d.memberSheet.statNet}
            valueClass={net >= 0 ? 'text-win text-lg' : 'text-accent text-lg'}
          >
            {`${net >= 0 ? '+' : ''}${net.toLocaleString()}`}
          </StatTile>
          <StatTile label={d.memberSheet.statBuyIn}>{member.buyInTotal.toLocaleString()}</StatTile>
        </div>

        <Button variant="ghost" className="w-full" onClick={onClose}>
          {d.common.close}
        </Button>
      </Sheet>
      <ConfirmDialog
        open={transferOpen}
        title={format(d.memberSheet.transferConfirmTitle, { name: member.displayName })}
        body={d.memberSheet.transferConfirmBody}
        confirmLabel={d.memberSheet.transferConfirmLabel}
        cancelLabel={d.common.cancel}
        tone="danger"

        loading={isPending}
        onConfirm={() =>
          run(async () => {
            const success = await runAction(
              () => transferHost({ roomId: snapshot.room.id, targetUserId: member.userId }),
              () => ({
                event: 'member.role_changed',
                payload: { userId: member.userId, role: 'host' },
              }),
            )
            if (success) setTransferOpen(false)
            return success
          })
        }
        onClose={() => setTransferOpen(false)}
      />
      <ConfirmDialog
        open={removeOpen}
        title={format(d.memberSheet.removeConfirmTitle, { name: member.displayName })}
        body={d.memberSheet.removeConfirmBody}
        confirmLabel={d.memberSheet.remove}
        cancelLabel={d.common.cancel}
        tone="danger"
        loading={isPending}
        onConfirm={() =>
          run(async () => {
            const success = await runAction(
              () => removeMember({ roomId: snapshot.room.id, targetUserId: member.userId }),
              () => ({ event: 'member.left', payload: { userId: member.userId } }),
            )
            if (success) setRemoveOpen(false)
            return success
          })
        }
        onClose={() => setRemoveOpen(false)}
      />
      <ConfirmDialog
        open={leaveOpen}
        title={d.memberSheet.leaveConfirmTitle}
        body={d.memberSheet.leaveConfirmBody}
        confirmLabel={d.memberSheet.leaveConfirmLabel}
        cancelLabel={d.common.cancel}
        tone="danger"
        loading={isPending}
        onConfirm={() =>
          run(async () => {
            const success = await runAction(
              () => leaveRoom({ roomId: snapshot.room.id }),
              () => ({ event: 'member.left', payload: { userId: selfId } }),
            )

            if (success) {
              setLeaveOpen(false)
              router.push('/')
            }
            return success
          })
        }
        onClose={() => setLeaveOpen(false)}
      />
      <ConfirmDialog
        open={undoOpen}
        title={format(d.memberSheet.undoConfirmTitle, { name: member.displayName })}
        body={d.memberSheet.undoConfirmBody}
        confirmLabel={d.memberSheet.undoConfirmLabel}
        cancelLabel={d.common.cancel}
        tone="danger"
        loading={isPending}
        onConfirm={() =>
          run(async () => {
            const success = await runAction(
              () => undoLastBuyIn({ roomId: snapshot.room.id, targetUserId: member.userId }),
              (data) => {
                toast(
                  format(d.memberSheet.undoneToast, { n: data.amount.toLocaleString() }),
                  'success',
                )
              },
            )
            if (success) setUndoOpen(false)
            return success
          }, false)
        }
        onClose={() => setUndoOpen(false)}
      />
    </>
  )
}
