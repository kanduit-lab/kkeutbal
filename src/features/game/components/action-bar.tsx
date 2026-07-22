'use client'

import { useState, useTransition } from 'react'
import { placeBet } from '@/features/betting/actions'
import type { BetActionKind, MemberView, RoomSnapshot } from '../types'
import { Button } from '@/components/ui'
import { BET_LABELS, type RunAction } from './shared'

const QUICK_AMOUNTS = [5, 10, 25, 50] as const

/**
 * 하단 고정 베팅 바 — 엄지 존, 탭 2회 이내.
 * 판이 없으면 비활성 + 사유를 보여준다 (숨기면 "왜 안 되지"가 된다).
 */
export function ActionBar({
  snapshot,
  self,
  runAction,
  inline = false,
}: {
  snapshot: RoomSnapshot
  self: MemberView
  runAction: RunAction
  /** true = 데스크톱 본문 안 정적 패널, false = 모바일 하단 고정 바 */
  inline?: boolean
}) {
  const [amount, setAmount] = useState(10)
  const [isPending, startTransition] = useTransition()

  const round = snapshot.currentRound
  const noRoundReason = round ? null : '딜러가 판을 시작하면 베팅할 수 있습니다'
  const balance = self.balance

  function fire(action: BetActionKind) {
    if (!round || isPending) return
    const betAmount = action === 'allin' ? balance : action === 'call' || action === 'raise' ? amount : 0
    startTransition(async () => {
      await runAction(
        () =>
          placeBet({
            actionId: crypto.randomUUID(),
            roomId: snapshot.room.id,
            action,
            amount: betAmount,
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

  const chipDisabled = !round || isPending
  const chipReason = noRoundReason ?? undefined

  return (
    <div
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
            : 'mx-auto w-full max-w-md space-y-2 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2.5'
        }
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted">
            내 칩 <span className="tabular-nums font-bold text-text">{balance.toLocaleString()}</span>
          </span>
          <div className="ml-auto flex items-center gap-1">
            {QUICK_AMOUNTS.map((quick) => (
              <Button
                key={quick}
                type="button"
                size="sm"
                variant={amount === quick ? 'primary' : 'surface'}
                className={amount === quick ? '' : 'border border-white/10'}
                onClick={() => setAmount(quick)}
              >
                {quick}
              </Button>
            ))}
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(event) => setAmount(Math.max(1, Number(event.target.value) || 1))}
              className="h-9 w-16 rounded-lg border border-gold/15 bg-bg-deep/70 px-2 text-center text-sm tabular-nums"
              aria-label="베팅 금액"
            />
          </div>
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          <Button
            type="button"
            variant="surface"
            className="border border-white/10"
            disabled={chipDisabled}
            disabledReason={chipReason}
            onClick={() => fire('check')}
          >
            {BET_LABELS.check}
          </Button>
          <Button
            type="button"
            variant="win"
            disabled={chipDisabled || balance < amount}
            disabledReason={chipReason ?? (balance < amount ? '잔액 부족' : undefined)}
            onClick={() => fire('call')}
          >
            {BET_LABELS.call}
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={chipDisabled || balance < amount}
            disabledReason={chipReason ?? (balance < amount ? '잔액 부족' : undefined)}
            onClick={() => fire('raise')}
          >
            {BET_LABELS.raise}
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={chipDisabled}
            disabledReason={chipReason}
            onClick={() => fire('fold')}
          >
            {BET_LABELS.fold}
          </Button>
          <Button
            type="button"
            variant="surface"
            className="border border-warn/40 text-warn"
            disabled={chipDisabled || balance < 1}
            disabledReason={chipReason ?? (balance < 1 ? '잔액 없음' : undefined)}
            onClick={() => fire('allin')}
          >
            {BET_LABELS.allin}
          </Button>
        </div>
      </div>
    </div>
  )
}
