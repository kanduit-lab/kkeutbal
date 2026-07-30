'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import type { ReactNode } from 'react'
import { placeBet } from '@/features/betting/actions'
import {
  contributedBy,
  minimumRaiseAmount,
  neededToCall,
  roundBetState,
} from '@/features/betting/round-bet-state'
import { playChip, playFold } from '@/lib/sound'
import { refreshRoom } from '../actions'
import type { BetActionKind, MemberView, RoomSnapshot } from '../types'
import { Button, Stepper, useToast } from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'
import {
  betLabelsFor,
  formatChips,
  lastAcceptedByUser,
  raisePresets,
  type RunAction,
} from './shared'

type ActionSlot = 'call' | 'raise' | 'fold'

export function ActionBar({
  snapshot,
  self,
  runAction,
  staleReason = null,
  inline = false,
  showBetting = true,
  dealerSlot = null,
}: {
  snapshot: RoomSnapshot
  self: MemberView
  runAction: RunAction

  staleReason?: string | null

  inline?: boolean

  /** false면 베팅 UI(칩/콜/레이즈/폴드)를 숨기고 dealerSlot만 보여준다 — 고스톱처럼 베팅이 없는 게임의 모바일 딜러 전용 바 */
  showBetting?: boolean

  /** 모바일 하단 바에 얹는 딜러 컴팩트 컨트롤(DealerQuickBar). 있으면 베팅 영역 위에 한 줄로 붙는다 */
  dealerSlot?: ReactNode
}) {
  const { d, locale } = useDict()
  const gameType = snapshot.room.gameType === 'poker' ? 'poker' : 'seotda'
  const labels = betLabelsFor(snapshot.room.gameType, d)
  const { toast } = useToast()
  const [raiseOpen, setRaiseOpen] = useState(false)
  const [raiseAmount, setRaiseAmount] = useState(0)
  const [isPending, startTransition] = useTransition()

  const [firingSlot, setFiringSlot] = useState<ActionSlot | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const root = document.documentElement
    if (inline) {
      root.style.removeProperty('--action-bar-h')
      return
    }
    const node = barRef.current
    if (!node) return
    const apply = () => root.style.setProperty('--action-bar-h', `${node.offsetHeight}px`)
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(node)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--action-bar-h')
    }
  }, [inline])

  const intentRef = useRef<{ id: string; action: BetActionKind; amount: number } | null>(null)

  const round = snapshot.currentRound
  const noRoundReason = round ? null : d.actionBar.noRound
  const balance = self.balance
  const pot = round?.pot ?? 0

  const myLastAccepted = useMemo(
    () => lastAcceptedByUser(snapshot.actions).get(self.userId) ?? null,
    [snapshot.actions, self.userId],
  )

  const hasPendingAction = useMemo(
    () =>
      snapshot.actions.some(
        (action) => action.status === 'pending' && action.userId === self.userId,
      ),
    [snapshot.actions, self.userId],
  )
  const gateReason =
    myLastAccepted?.action === 'fold'
      ? d.actionBar.foldedGate
      : myLastAccepted?.action === 'allin'
        ? d.actionBar.allinGate
        : hasPendingAction
          ? d.actionBar.pendingGate
          : (staleReason ?? null)

  const betting = useMemo(() => roundBetState(snapshot.actions), [snapshot.actions])
  const contribution = contributedBy(betting, self.userId)
  const lastBet = betting.currentToCall
  const needed = neededToCall(betting, self.userId)

  const base = snapshot.room.baseBet
  const canCheck = needed === 0

  const callAmount = Math.min(needed, balance)
  const callIsAllin = needed > 0 && balance <= needed
  const minRaise = minimumRaiseAmount(betting, self.userId, base)

  const minRaiseRounded = base > 0 ? Math.ceil(minRaise / base) * base : minRaise
  const presets = useMemo(() => {
    const standard = raisePresets(gameType, { lastBet, pot, base }, d.presets)
      .filter((preset) => preset.amount > lastBet)
      .map((preset) => ({ ...preset, amount: preset.amount - contribution }))
      .filter((preset) => preset.amount >= minRaise)

    return balance > 0 ? [...standard, { label: labels.allin, amount: balance }] : standard
  }, [gameType, lastBet, pot, base, balance, labels.allin, minRaise, contribution, d.presets])

  function fire(action: BetActionKind, amount: number, slot: ActionSlot) {
    if (!round || isPending || gateReason) return

    const previous = intentRef.current
    const intent =
      previous && previous.action === action && previous.amount === amount
        ? previous
        : { id: crypto.randomUUID(), action, amount }
    intentRef.current = intent
    setFiringSlot(slot)

    const runIntent = async () => {
      const settled: { current: Awaited<ReturnType<typeof placeBet>> | null } = { current: null }
      let success = false
      try {
        success = await runAction(
          () =>
            placeBet({
              actionId: intent.id,
              roomId: snapshot.room.id,
              action,
              amount,
            }).then((result) => {
              settled.current = result
              return result
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
      } catch (error) {
        console.error('placeBet request failed:', error)
        toast(d.actionBar.networkRetry, 'error')
      }
      if (success) {
        intentRef.current = null
        if (action === 'fold') playFold()
        else if (amount > 0) playChip()
        setRaiseOpen(false)
        return
      }
      if (settled.current !== null && !settled.current.success) {
        intentRef.current = null
        return
      }

      let landed = false
      try {
        await runAction(
          () => refreshRoom(snapshot.room.id),
          (data) => {
            landed = data.actions.some((entry) => entry.id === intent.id)
          },
        )
      } catch (error) {
        console.error('refreshRoom request failed:', error)
      }
      if (!landed) return
      intentRef.current = null
      toast(d.actionBar.alreadyApplied)
      if (action === 'fold') playFold()
      else if (amount > 0) playChip()
      setRaiseOpen(false)
    }

    startTransition(async () => {
      try {
        await runIntent()
      } finally {
        setFiringSlot(null)
      }
    })
  }

  const disabled = !round || isPending || gateReason !== null
  const reason = noRoundReason ?? gateReason ?? undefined

  return (
    <div
      ref={barRef}
      className={
        inline
          ? 'lacquer mt-4 rounded-2xl'
          : 'fixed inset-x-0 bottom-0 z-40 border-t border-gold/15 bg-bg-deep/95 backdrop-blur'
      }
    >
      <div
        className={
          inline
            ? 'space-y-3 p-5'
            : 'mx-auto w-full max-w-lg space-y-2.5 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3'
        }
      >
        {dealerSlot ? (
          <div className={showBetting ? 'border-b border-white/10 pb-2.5' : undefined}>
            {dealerSlot}
          </div>
        ) : null}
        {showBetting ? (
          <>
            <div className="flex items-center justify-between text-sm font-medium text-muted">
              <span>
                {d.actionBar.myChips}{' '}
                <span className="gilt text-base font-black tabular-nums">
                  {formatChips(balance, locale)}
                </span>
              </span>
              {needed > 0 ? (
                <span>
                  {d.actionBar.toCall}{' '}
                  <span className="text-base font-black tabular-nums text-warn">
                    {formatChips(callAmount, locale)}
                  </span>
                </span>
              ) : lastBet === 0 ? (
                <span>{d.actionBar.beforeFirstBet}</span>
              ) : (
                <span>{d.actionBar.waitingForCall}</span>
              )}
            </div>
            {gateReason ? (
              <p className="text-center text-sm font-medium text-muted">{gateReason}</p>
            ) : null}
            {raiseOpen && round && !gateReason ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>{d.actionBar.raiseAmount}</span>
                  <span>{format(d.actionBar.minRaise, { n: formatChips(minRaise, locale) })}</span>
                </div>
                <div
                  className={
                    presets.length > 4 ? 'grid grid-cols-5 gap-1.5' : 'grid grid-cols-4 gap-1.5'
                  }
                >
                  {presets.map((preset) => (
                    <Button
                      key={preset.label}
                      type="button"
                      size="sm"
                      selected={raiseAmount === preset.amount}
                      className="flex-col gap-0"
                      disabled={preset.amount > balance}
                      disabledReason={
                        preset.amount > balance ? d.actionBar.insufficientBalance : undefined
                      }
                      onClick={() => setRaiseAmount(preset.amount)}
                    >
                      {preset.label}
                      <span className="tabular-nums text-[11px] leading-tight opacity-80">
                        {formatChips(preset.amount, locale)}
                      </span>
                    </Button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Stepper
                    value={raiseAmount}
                    onChange={setRaiseAmount}
                    min={0}
                    max={balance}
                    step={base}
                    ariaLabel={d.actionBar.raiseAmount}
                    decreaseLabel={d.ui.decrease}
                    increaseLabel={d.ui.increase}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="lg"
                    className="px-6"
                    loading={firingSlot === 'raise'}
                    loadingLabel={d.ui.processing}
                    disabled={isPending || raiseAmount < minRaise || raiseAmount > balance}
                    disabledReason={
                      raiseAmount < minRaise
                        ? format(d.actionBar.minRaise, { n: formatChips(minRaise, locale) })
                        : raiseAmount > balance
                          ? d.actionBar.insufficientBalance
                          : undefined
                    }
                    onClick={() =>
                      fire(raiseAmount >= balance ? 'allin' : 'raise', raiseAmount, 'raise')
                    }
                  >
                    {format(d.actionBar.confirmAction, {
                      label: raiseAmount >= balance ? labels.allin : labels.raise,
                    })}
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-3 gap-2">
              {canCheck ? (
                <Button
                  type="button"
                  variant="win"
                  size="lg"
                  className="whitespace-nowrap px-1 text-lg"
                  loading={firingSlot === 'call'}
                  loadingLabel={d.ui.processing}
                  disabled={disabled}
                  disabledReason={reason}
                  onClick={() => fire('check', 0, 'call')}
                >
                  {labels.check}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="win"
                  size="lg"
                  className="flex-col gap-0 whitespace-nowrap px-1"
                  loading={firingSlot === 'call'}
                  loadingLabel={d.ui.processing}
                  disabled={disabled || callAmount < 1}
                  disabledReason={reason ?? (callAmount < 1 ? d.actionBar.noBalance : undefined)}
                  onClick={() => fire(callIsAllin ? 'allin' : 'call', callAmount, 'call')}
                >
                  <span className="text-lg leading-tight">
                    {callIsAllin ? labels.allin : labels.call}
                  </span>
                  <span className="tabular-nums text-xs leading-tight opacity-90">
                    {formatChips(callAmount, locale)}
                  </span>
                </Button>
              )}
              <Button
                type="button"
                variant="primary"
                size="lg"
                className="whitespace-nowrap px-1 text-lg"
                disabled={disabled || balance < 1}
                disabledReason={
                  reason ?? (balance < 1 ? d.actionBar.insufficientBalance : undefined)
                }
                onClick={() => {
                  if (!raiseOpen) {
                    const firstValid = presets.find((preset) => preset.amount <= balance)
                    setRaiseAmount(firstValid?.amount ?? minRaiseRounded)
                  }
                  setRaiseOpen((open) => !open)
                }}
              >
                {labels.raise}
              </Button>
              <Button
                type="button"
                variant="danger"
                size="lg"
                className="whitespace-nowrap px-1 text-lg"
                loading={firingSlot === 'fold'}
                loadingLabel={d.ui.processing}
                disabled={disabled}
                disabledReason={reason}
                onClick={() => fire('fold', 0, 'fold')}
              >
                {labels.fold}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
