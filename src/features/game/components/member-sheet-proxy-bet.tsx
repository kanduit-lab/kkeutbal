'use client'

import { useRef, useState } from 'react'
import { placeBet } from '@/features/betting/actions'
import { format, useDict } from '@/lib/i18n/client'
import type { BetActionKind } from '../types'
import { Button, Stepper } from '@/components/ui'
import type { RunAction } from './shared'
import { Section } from './member-sheet-parts'

/**
 * 대리 베팅 섹션 — 딜러가 멤버 대신 체크/콜/레이즈/폴드를 입력한다.
 * MemberSheet 의 canProxy 게이팅 블록에서 그대로 옮겨왔다.
 */
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
  const callAmount = Math.min(callNeeded, memberBalance)
  const callIsAllIn = callNeeded > 0 && memberBalance <= callNeeded
  const minRaise = lastBet === 0 ? baseBet : callNeeded + 1
  /** 최소 레이즈에 못 미치는 잔액은 올인으로만 유효하다. */
  const raiseInputMin = Math.min(minRaise, memberBalance)
  const canConfirmRaise = raiseAmount >= minRaise || raiseAmount === memberBalance

  /**
   * 대리 베팅 멱등키 — 같은 의도(대상·액션·금액)의 재시도는 같은 actionId 로 재전송한다.
   * 타임아웃 후 재탭이 서버에 이중 기록되는 것을 placeBet 멱등 처리로 흡수하기 위함이다.
   * 성공(확정 응답)하면 비우고, 실패는 타임아웃일 수 있어 키를 유지한다.
   */
  const proxyIntentRef = useRef<{ key: string; id: string } | null>(null)

  function proxyBet(action: BetActionKind, amount: number) {
    const key = `${memberId}:${action}:${amount}`
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
          variant="surface"
          className="border border-white/10"
          disabled={isPending || callNeeded !== 0}
          disabledReason={callNeeded !== 0 ? d.memberSheet.checkBlocked : undefined}
          onClick={() => proxyBet('check', 0)}
        >
          {labels.check}
        </Button>
        <Button
          variant="win"
          className="flex-col gap-0"
          disabled={isPending || callNeeded === 0 || callAmount < 1}
          disabledReason={
            callNeeded === 0
              ? d.memberSheet.noBetToCall
              : callAmount < 1
                ? d.actionBar.insufficientBalance
                : undefined
          }
          onClick={() => proxyBet(callIsAllIn ? 'allin' : 'call', callAmount)}
        >
          <span>{callIsAllIn ? labels.allin : labels.call}</span>
          {callAmount > 0 ? (
            <span className="tabular-nums text-[11px] leading-tight opacity-90">
              {callAmount.toLocaleString()}
            </span>
          ) : null}
        </Button>
        <Button
          variant={raiseOpen ? 'primary' : 'surface'}
          className={raiseOpen ? '' : 'border border-white/10'}
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
        <Button variant="danger" disabled={isPending} onClick={() => proxyBet('fold', 0)}>
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
            className="flex-1"
          />
          <Button
            variant="primary"
            disabled={isPending || !canConfirmRaise || raiseAmount > memberBalance}
            disabledReason={
              !canConfirmRaise
                ? format(d.actionBar.minRaise, { n: minRaise.toLocaleString() })
                : raiseAmount > memberBalance
                  ? d.actionBar.insufficientBalance
                  : undefined
            }
            onClick={() =>
              proxyBet(raiseAmount >= memberBalance ? 'allin' : 'raise', raiseAmount)
            }
          >
            {d.common.confirm}
          </Button>
        </div>
      ) : null}
    </Section>
  )
}
