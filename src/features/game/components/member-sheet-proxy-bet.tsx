'use client'

import { useRef, useState } from 'react'
import { placeBet } from '@/features/betting/actions'
import { format, useDict } from '@/lib/i18n/client'
import type { BetActionKind } from '../types'
import { Button, Stepper } from '@/components/ui'
import type { RunAction } from './shared'
import type { ProxyBlockReason } from './member-sheet-gating'
import { Section } from './member-sheet-parts'

/**
 * canProxy가 false인 이유를 그대로 보여준다 — 숨기지 않고 왜 안 되는지 + 다음 행동을 안내.
 * noRound는 이 함수가 호출되는 시점에 항상 isDealer가 참인 경우에만 나오므로
 * (member-sheet-gating.ts의 proxyBlockReason 우선순위 참고) 딜러 안내를 항상 곁들인다.
 */
export function ProxyBlockedNotice({ reason }: { reason: ProxyBlockReason }) {
  const { d } = useDict()
  const message =
    reason === 'gostop'
      ? d.memberSheet.gostopNoBetting
      : reason === 'notDealer'
        ? d.memberSheet.proxyDealerOnly
        : reason === 'observerTarget'
          ? d.memberSheet.observerNoBetting
          : d.memberSheet.proxyNoRound

  return (
    <Section icon="🃏" title={d.memberSheet.proxyTitle}>
      <p className="text-sm text-muted">{message}</p>
      {reason === 'noRound' ? (
        <p className="text-xs text-muted">{d.memberSheet.noRoundDealerHint}</p>
      ) : null}
    </Section>
  )
}

export function ProxyBetSection({
  roomId,
  memberId,
  memberBalance,
  baseBet,
  labels,
  lastBet,
  callNeeded,
  isPending,
  run,
  runAction,
}: {
  roomId: string
  memberId: string
  memberBalance: number
  baseBet: number
  labels: Record<BetActionKind, string>
  lastBet: number
  callNeeded: number
  isPending: boolean
  run: (task: () => Promise<boolean>, closeAfter?: boolean) => void
  runAction: RunAction
}) {
  const { d } = useDict()
  const [raiseOpen, setRaiseOpen] = useState(false)
  const [raiseAmount, setRaiseAmount] = useState(baseBet)

  const [firingSlot, setFiringSlot] = useState<'check' | 'call' | 'raise' | 'fold' | null>(null)
  const callAmount = Math.min(callNeeded, memberBalance)
  const callIsAllIn = callNeeded > 0 && memberBalance <= callNeeded
  const minRaise = lastBet === 0 ? baseBet : callNeeded + 1

  const raiseInputMin = Math.min(minRaise, memberBalance)
  const canConfirmRaise = raiseAmount >= minRaise || raiseAmount === memberBalance

  const proxyIntentRef = useRef<{ key: string; id: string } | null>(null)

  function proxyBet(
    action: BetActionKind,
    amount: number,
    slot: 'check' | 'call' | 'raise' | 'fold',
  ) {
    const key = `${memberId}:${action}:${amount}`
    const intent =
      proxyIntentRef.current?.key === key
        ? proxyIntentRef.current
        : { key, id: crypto.randomUUID() }
    proxyIntentRef.current = intent
    setFiringSlot(slot)
    run(async () => {
      const success = await runAction(
        () =>
          placeBet({
            actionId: intent.id,
            roomId,
            action,
            amount,
            targetUserId: memberId,
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
      setFiringSlot(null)
      return success
    })
  }

  return (
    <Section
      icon="🃏"
      title={d.memberSheet.proxyTitle}
      hint={`${d.memberSheet.proxyHint}${
        callNeeded > 0
          ? ` · ${format(d.memberSheet.toCallAmount, { n: callNeeded.toLocaleString() })}`
          : ''
      }`}
    >
      <div className="grid grid-cols-4 gap-2">
        <Button
          variant="outline"
          loading={firingSlot === 'check'}
          disabled={isPending || callNeeded !== 0}
          disabledReason={callNeeded !== 0 ? d.memberSheet.checkBlocked : undefined}
          onClick={() => proxyBet('check', 0, 'check')}
        >
          {labels.check}
        </Button>
        <Button
          variant="win"
          className="flex-col gap-0"
          loading={firingSlot === 'call'}
          disabled={isPending || callNeeded === 0 || callAmount < 1}
          disabledReason={
            callNeeded === 0
              ? d.memberSheet.noBetToCall
              : callAmount < 1
                ? d.actionBar.insufficientBalance
                : undefined
          }
          onClick={() => proxyBet(callIsAllIn ? 'allin' : 'call', callAmount, 'call')}
        >
          <span>{callIsAllIn ? labels.allin : labels.call}</span>
          {callAmount > 0 ? (
            <span className="tabular-nums text-[11px] leading-tight opacity-90">
              {callAmount.toLocaleString()}
            </span>
          ) : null}
        </Button>
        <Button
          selected={raiseOpen}
          aria-expanded={raiseOpen}
          disabled={isPending || memberBalance < 1}
          disabledReason={memberBalance < 1 ? d.actionBar.insufficientBalance : undefined}
          onClick={() => {
            if (!raiseOpen) {
              setRaiseAmount(Math.min(memberBalance, Math.max(baseBet, minRaise)))
            }
            setRaiseOpen((open) => !open)
          }}
        >
          {labels.raise}
        </Button>
        <Button
          variant="danger"
          loading={firingSlot === 'fold'}
          disabled={isPending}
          onClick={() => proxyBet('fold', 0, 'fold')}
        >
          {labels.fold}
        </Button>
      </div>
      {raiseOpen ? (
        <div className="flex gap-2">
          <Stepper
            value={raiseAmount}
            onChange={setRaiseAmount}
            min={raiseInputMin}
            max={memberBalance}
            step={baseBet}
            ariaLabel={d.memberSheet.proxyRaiseAria}
            decreaseLabel={d.ui.decrease}
            increaseLabel={d.ui.increase}
            className="flex-1"
          />
          <Button
            variant="primary"
            loading={firingSlot === 'raise'}
            loadingLabel={d.ui.processing}
            disabled={isPending || !canConfirmRaise || raiseAmount > memberBalance}
            disabledReason={
              !canConfirmRaise
                ? format(d.actionBar.minRaise, { n: minRaise.toLocaleString() })
                : raiseAmount > memberBalance
                  ? d.actionBar.insufficientBalance
                  : undefined
            }
            onClick={() =>
              proxyBet(raiseAmount >= memberBalance ? 'allin' : 'raise', raiseAmount, 'raise')
            }
          >
            {d.common.confirm}
          </Button>
        </div>
      ) : null}
    </Section>
  )
}