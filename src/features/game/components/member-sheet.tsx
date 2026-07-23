'use client'

import { clsx } from 'clsx'
import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { placeBet } from '@/features/betting/actions'
import { addBuyIn, undoLastBuyIn } from '@/features/budget/actions'
import { format, useDict } from '@/lib/i18n/client'
import { leaveRoom, removeMember, setMemberRole, transferHost } from '../member-actions'
import type { BetActionKind, MemberView, RoomSnapshot } from '../types'
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  Stepper,
  useModalBehavior,
  useToast,
} from '@/components/ui'
import type { RunAction } from './shared'

/** 역할 선택지 — 라벨은 사전(d.roles)에서 가져온다. */
const ROLE_OPTIONS = [
  { role: 'dealer', emoji: '🎩' },
  { role: 'player', emoji: '🎮' },
  { role: 'observer', emoji: '👀' },
] as const

/** 시트 내부 섹션 — 아이콘·제목·힌트가 있는 카드. */
function Section({
  icon,
  title,
  hint,
  children,
}: {
  icon: string
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <section className="space-y-2.5 rounded-2xl border border-white/5 bg-bg-deep/50 p-4">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <span aria-hidden>{icon}</span>
          {title}
        </p>
        {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  )
}

function StatTile({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="rounded-xl bg-bg-deep/60 px-2 py-2.5 text-center">
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <p className={clsx('mt-0.5 text-lg font-black tabular-nums leading-tight', valueClass)}>
        {value}
      </p>
    </div>
  )
}

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
  const [buyInAmount, setBuyInAmount] = useState(startingChips)
  const [raiseOpen, setRaiseOpen] = useState(false)
  const [raiseAmount, setRaiseAmount] = useState(snapshot.room.baseBet)
  const [transferOpen, setTransferOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [undoOpen, setUndoOpen] = useState(false)

  /**
   * 대리 베팅 멱등키 — 같은 의도(대상·액션·금액)의 재시도는 같은 actionId 로 재전송한다.
   * 타임아웃 후 재탭이 서버에 이중 기록되는 것을 placeBet 멱등 처리로 흡수하기 위함이다.
   * 성공(확정 응답)하면 비우고, 실패는 타임아웃일 수 있어 키를 유지한다.
   */
  const proxyIntentRef = useRef<{ key: string; id: string } | null>(null)

  const anyConfirmOpen = transferOpen || removeOpen || leaveOpen || undoOpen
  const panelRef = useModalBehavior(true, () => {
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

  const buyInPresets = useMemo(() => {
    const half = Math.max(1, Math.round(startingChips / 2))
    return [
      { label: d.memberSheet.presetStartingChips, amount: startingChips },
      { label: d.memberSheet.presetHalf, amount: half },
    ]
  }, [startingChips, d])

  const lastBet = useMemo(() => {
    const accepted = snapshot.actions.filter(
      (action) => action.status === 'accepted' && action.amount > 0,
    )
    return accepted.length > 0 ? accepted[accepted.length - 1]!.amount : 0
  }, [snapshot.actions])

  const run = (task: () => Promise<boolean>, closeAfter = true) => {
    if (isPending) return
    startTransition(async () => {
      const success = await task()
      if (success && closeAfter) onClose()
    })
  }

  function proxyBet(action: BetActionKind, amount: number) {
    const key = `${member.userId}:${action}:${amount}`
    const intent =
      proxyIntentRef.current?.key === key
        ? proxyIntentRef.current
        : { key, id: crypto.randomUUID() }
    proxyIntentRef.current = intent
    run(async () => {
      const success = await runAction(
        () =>
          placeBet({
            actionId: intent.id,
            roomId: snapshot.room.id,
            action,
            amount,
            targetUserId: member.userId,
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
      if (success) proxyIntentRef.current = null
      return success
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
            <Section
              icon="🃏"
              title={d.memberSheet.proxyTitle}
              hint={`${d.memberSheet.proxyHint}${
                lastBet > 0
                  ? ` · ${format(d.memberSheet.toCallAmount, { n: lastBet.toLocaleString() })}`
                  : ''
              }`}
            >
              <div className="grid grid-cols-4 gap-2">
                <Button
                  variant="surface"
                  className="border border-white/10"
                  disabled={isPending || lastBet !== 0}
                  disabledReason={lastBet !== 0 ? d.memberSheet.checkBlocked : undefined}
                  onClick={() => proxyBet('check', 0)}
                >
                  {labels.check}
                </Button>
                <Button
                  variant="win"
                  className="flex-col gap-0"
                  disabled={isPending || lastBet === 0 || member.balance < lastBet}
                  disabledReason={
                    lastBet === 0
                      ? d.memberSheet.noBetToCall
                      : member.balance < lastBet
                        ? d.actionBar.insufficientBalance
                        : undefined
                  }
                  onClick={() => proxyBet('call', lastBet)}
                >
                  <span>{labels.call}</span>
                  {lastBet > 0 ? (
                    <span className="tabular-nums text-[11px] leading-tight opacity-90">
                      {lastBet.toLocaleString()}
                    </span>
                  ) : null}
                </Button>
                <Button
                  variant={raiseOpen ? 'primary' : 'surface'}
                  className={raiseOpen ? '' : 'border border-white/10'}
                  disabled={isPending}
                  onClick={() => setRaiseOpen((open) => !open)}
                >
                  {labels.raise}
                </Button>
                <Button variant="danger" disabled={isPending} onClick={() => proxyBet('fold', 0)}>
                  {labels.fold}
                </Button>
              </div>
              {raiseOpen ? (
                <div className="flex gap-2">
                  <Stepper
                    value={raiseAmount}
                    onChange={setRaiseAmount}
                    min={1}
                    max={member.balance}
                    step={snapshot.room.baseBet}
                    ariaLabel={d.memberSheet.proxyRaiseAria}
                    className="flex-1"
                  />
                  <Button
                    variant="primary"
                    disabled={isPending || raiseAmount < 1 || raiseAmount > member.balance}
                    onClick={() => proxyBet('raise', raiseAmount)}
                  >
                    {d.common.confirm}
                  </Button>
                </div>
              ) : null}
            </Section>
          ) : null}

          {isDealer ? (
            <Section icon="💰" title={d.memberSheet.buyInTitle} hint={d.memberSheet.buyInHint}>
              <div className="grid grid-cols-2 gap-2">
                {buyInPresets.map((preset) => (
                  <Button
                    key={preset.label}
                    size="sm"
                    variant={buyInAmount === preset.amount ? 'primary' : 'surface'}
                    className={clsx('flex-col gap-0', buyInAmount !== preset.amount && 'border border-white/10')}
                    onClick={() => setBuyInAmount(preset.amount)}
                  >
                    {preset.label}
                    <span className="tabular-nums text-[11px] leading-tight opacity-80">
                      +{preset.amount.toLocaleString()}
                    </span>
                  </Button>
                ))}
              </div>
              <Stepper
                value={buyInAmount}
                onChange={setBuyInAmount}
                min={1}
                max={1_000_000}
                step={snapshot.room.baseBet}
                ariaLabel={d.memberSheet.buyInAria}
              />
              <Button
                variant="win"
                size="lg"
                className="w-full"
                disabled={isPending}
                onClick={() =>
                  run(() =>
                    runAction(() =>
                      addBuyIn({
                        roomId: snapshot.room.id,
                        amount: buyInAmount,
                        targetUserId: member.userId,
                      }),
                    ),
                  )
                }
              >
                💰 {format(d.memberSheet.grant, { n: buyInAmount.toLocaleString() })}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                disabled={isPending || member.buyInTotal <= 0}
                disabledReason={member.buyInTotal <= 0 ? d.memberSheet.nothingToUndo : undefined}
                onClick={() => setUndoOpen(true)}
              >
                ↩ {d.memberSheet.undoLast}
              </Button>
            </Section>
          ) : null}

          {isHost && !isSelf && member.role !== 'host' ? (
            <Section icon="🎭" title={d.memberSheet.roleTitle} hint={d.memberSheet.roleHint}>
              <div className="grid grid-cols-3 gap-2">
                {ROLE_OPTIONS.map((option) => {
                  const selected = member.role === option.role
                  return (
                    <Button
                      key={option.role}
                      variant={selected ? 'primary' : 'surface'}
                      className={clsx('min-h-16 flex-col gap-0.5', !selected && 'border border-white/10')}
                      disabled={isPending}
                      pressed={selected}
                      onClick={() => {
                        // 이미 선택된 역할 — 재전송할 것이 없다. 시각은 pressed 로 유지된다.
                        if (selected) return
                        run(() =>
                          runAction(
                            () =>
                              setMemberRole({
                                roomId: snapshot.room.id,
                                targetUserId: member.userId,
                                role: option.role,
                              }),
                            () => ({
                              event: 'member.role_changed',
                              payload: { userId: member.userId, role: option.role },
                            }),
                          ),
                        )
                      }}
                    >
                      <span className="text-xl leading-none" aria-hidden>
                        {option.emoji}
                      </span>
                      <span className="text-sm">{d.roles[option.role]}</span>
                    </Button>
                  )
                })}
              </div>
              <Button
                variant="danger"
                className="w-full"
                disabled={isPending}
                onClick={() => setTransferOpen(true)}
              >
                👑 {d.memberSheet.transferHost}
              </Button>
            </Section>
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
                () =>
                  undoLastBuyIn({ roomId: snapshot.room.id, targetUserId: member.userId }),
                (data) => {
                  // 취소된 실제 금액은 서버 응답에서만 안다 — 성공 토스트로 알려준다.
                  toast(format(d.memberSheet.undoneToast, { n: data.amount.toLocaleString() }), 'success')
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
