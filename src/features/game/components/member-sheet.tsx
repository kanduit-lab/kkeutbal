'use client'

import { clsx } from 'clsx'
import { useMemo, useState, useTransition } from 'react'
import type { ReactNode } from 'react'
import { placeBet } from '@/features/betting/actions'
import { addBuyIn } from '@/features/budget/actions'
import { setMemberRole, transferHost } from '../member-actions'
import type { BetActionKind, MemberView, RoomSnapshot } from '../types'
import { Avatar, Badge, Button, ConfirmDialog, Stepper } from '@/components/ui'
import { BET_LABELS_BY_GAME, type RunAction } from './shared'

const ROLE_OPTIONS = [
  { role: 'dealer', label: '딜러', emoji: '🎩' },
  { role: 'player', label: '플레이어', emoji: '🎮' },
  { role: 'observer', label: '관전자', emoji: '👀' },
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
 * - 딜러·방장: 추가 바이인, 대리 입력 (베팅 게임)
 * - 방장: 역할 변경, 방장 위임
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
  const [isPending, startTransition] = useTransition()
  const startingChips = snapshot.room.startingChips
  const [buyInAmount, setBuyInAmount] = useState(startingChips)
  const [raiseOpen, setRaiseOpen] = useState(false)
  const [raiseAmount, setRaiseAmount] = useState(snapshot.room.baseBet)
  const [transferOpen, setTransferOpen] = useState(false)

  const self = snapshot.members.find((m) => m.userId === selfId)
  const isHost = self?.role === 'host'
  const isDealer = isHost || self?.role === 'dealer'
  const isSelf = member.userId === selfId
  const isBettingGame = snapshot.room.gameType !== 'gostop'
  const labels = BET_LABELS_BY_GAME[snapshot.room.gameType === 'poker' ? 'poker' : 'seotda']
  const round = snapshot.currentRound
  const net = member.balance - member.buyInTotal

  const buyInPresets = useMemo(() => {
    const half = Math.max(1, Math.round(startingChips / 2))
    return [
      { label: '시작 칩만큼', amount: startingChips },
      { label: '절반', amount: half },
    ]
  }, [startingChips])

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
    run(() =>
      runAction(
        () =>
          placeBet({
            actionId: crypto.randomUUID(),
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
      ),
    )
  }

  const canProxy = isDealer && isBettingGame && member.role !== 'observer' && Boolean(round)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${member.displayName} 멤버 메뉴`}
      onClick={onClose}
    >
      <div
        className="lacquer max-h-[88dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-3xl p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] sm:rounded-3xl"
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
                  {member.role === 'host' ? '방장' : member.role === 'dealer' ? '딜러' : '관전'}
                </Badge>
              ) : null}
              {isSelf ? <Badge tone="muted">나</Badge> : null}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <StatTile label="잔액" value={member.balance.toLocaleString()} valueClass="gilt" />
          <StatTile
            label="손익"
            value={`${net >= 0 ? '+' : ''}${net.toLocaleString()}`}
            valueClass={net >= 0 ? 'text-win' : 'text-accent'}
          />
          <StatTile label="바이인" value={member.buyInTotal.toLocaleString()} />
        </div>

        {canProxy ? (
          <Section
            icon="🃏"
            title="대리 입력"
            hint={`폰이 없는 참가자의 액션을 대신 기록합니다${lastBet > 0 ? ` · 받을 금액 ${lastBet.toLocaleString()}` : ''}`}
          >
            <div className="grid grid-cols-4 gap-2">
              <Button
                variant="surface"
                className="border border-white/10"
                disabled={isPending || lastBet !== 0}
                disabledReason={lastBet !== 0 ? '베팅이 나와 체크할 수 없습니다' : undefined}
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
                    ? '받을 베팅이 없습니다'
                    : member.balance < lastBet
                      ? '잔액 부족'
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
                  ariaLabel="대리 레이즈 금액"
                  className="flex-1"
                />
                <Button
                  variant="primary"
                  disabled={isPending || raiseAmount < 1 || raiseAmount > member.balance}
                  onClick={() => proxyBet('raise', raiseAmount)}
                >
                  확정
                </Button>
              </div>
            ) : null}
          </Section>
        ) : null}

        {isDealer ? (
          <Section
            icon="💰"
            title="추가 바이인"
            hint="칩이 부족한 참가자에게 추가 칩을 지급합니다 (원장에 기록됩니다)"
          >
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
              ariaLabel="바이인 금액"
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
              💰 {buyInAmount.toLocaleString()} 지급
            </Button>
          </Section>
        ) : null}

        {isHost && !isSelf && member.role !== 'host' ? (
          <Section
            icon="🎭"
            title="역할"
            hint="딜러는 판 진행·승인, 관전자는 베팅 없이 구경만 합니다"
          >
            <div className="grid grid-cols-3 gap-2">
              {ROLE_OPTIONS.map((option) => (
                <Button
                  key={option.role}
                  variant={member.role === option.role ? 'primary' : 'surface'}
                  className={clsx(
                    'min-h-16 flex-col gap-0.5',
                    member.role === option.role
                      ? 'disabled:opacity-100'
                      : 'border border-white/10',
                  )}
                  disabled={isPending || member.role === option.role}
                  onClick={() =>
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
                  }
                >
                  <span className="text-xl leading-none" aria-hidden>
                    {option.emoji}
                  </span>
                  <span className="text-sm">{option.label}</span>
                </Button>
              ))}
            </div>
            <Button
              variant="danger"
              className="w-full"
              disabled={isPending}
              onClick={() => setTransferOpen(true)}
            >
              👑 이 사람에게 방장 위임
            </Button>
          </Section>
        ) : null}

        <Button variant="ghost" className="w-full" onClick={onClose}>
          닫기
        </Button>

        <ConfirmDialog
          open={transferOpen}
          title={`${member.displayName} 님에게 방장을 넘길까요?`}
          body="위임하면 나는 플레이어가 되고 역할 변경·정산 권한을 잃습니다."
          confirmLabel="위임"
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
      </div>
    </div>
  )
}
