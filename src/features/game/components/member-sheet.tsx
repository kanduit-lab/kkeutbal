'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { undoLastBuyIn } from '@/features/budget/actions'
import { neededToCall, roundBetState } from '@/features/betting/round-bet-state'
import { format, useDict } from '@/lib/i18n/client'
import { leaveRoom, removeMember, transferHost } from '../member-actions'
import type { MemberView, RoomSnapshot } from '../types'
import { Avatar, Badge, Button, ConfirmDialog, Sheet, StatTile, useToast } from '@/components/ui'
import type { RunAction } from './shared'
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
  open,
  member,
  snapshot,
  selfId,
  runAction,
  onClose,
}: {
  /** 열림 상태는 부모가 소유한다 — Sheet 가 퇴장 애니메이션 뒤에 스스로 언마운트한다. */
  open: boolean
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
  /** 중첩 확인 다이얼로그가 열려 있으면 Escape·바깥 탭은 그쪽만 닫는다 — 시트까지 닫히면 흐름이 끊긴다. */
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
  /**
   * 조작 섹션이 하나도 안 뜨는 조합(일반 참가자가 남의 좌석을 탭)에서는 시트가
   * 아바타 + 숫자 3개 + 닫기 로 끝나 "로딩 실패"처럼 읽힌다 — 읽기 전용임을 밝힌다.
   */
  const hasActionSection =
    canProxy || isDealer || (isHost && !isSelf && member.role !== 'host') || showRemove || isSelf

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
          </div>
        </div>

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
          <StatTile label={d.memberSheet.statBuyIn}>
            {member.buyInTotal.toLocaleString()}
          </StatTile>
        </div>

        {!hasActionSection ? (
          <p className="text-xs text-muted">{d.memberSheet.viewOnlyHint}</p>
        ) : null}

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
        // 다이얼로그를 먼저 닫아 버리면 요청이 도는 동안 아무 표시도 남지 않는다 —
        // 열어 둔 채 확인 버튼에 스피너를 띄우고, 성공하면 그때 닫는다.
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
            // 나간 뒤에는 이 방 스냅샷을 더 읽을 수 없다 — 홈(내 방 목록)으로 즉시 이동한다.
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
          run(
            async () => {
              const success = await runAction(
                () => undoLastBuyIn({ roomId: snapshot.room.id, targetUserId: member.userId }),
                (data) => {
                  // 취소된 실제 금액은 서버 응답에서만 안다 — 성공 토스트로 알려준다.
                  toast(
                    format(d.memberSheet.undoneToast, { n: data.amount.toLocaleString() }),
                    'success',
                  )
                },
              )
              if (success) setUndoOpen(false)
              return success
            },
            // 시트를 열어 둬 잔액이 줄어든 것을 바로 확인하게 한다.
            false,
          )
        }
        onClose={() => setUndoOpen(false)}
      />
    </>
  )
}
