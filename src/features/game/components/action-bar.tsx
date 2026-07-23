'use client'

import { useMemo, useState, useTransition } from 'react'
import { placeBet } from '@/features/betting/actions'
import { playChip, playFold } from '@/lib/sound'
import type { BetActionKind, MemberView, RoomSnapshot } from '../types'
import { Button, Stepper } from '@/components/ui'
import { BET_LABELS_BY_GAME, raisePresets, type RunAction } from './shared'

/**
 * 하단 고정 베팅 바 — 표준 베팅 규칙, 키보드 없이 터치만으로 조작한다.
 *
 * - 콜 금액 = 직전 확정 베팅 금액 (자동, 입력 불가). 잔액이 모자라면 올인 콜.
 * - 체크 = 이번 판에 아직 베팅이 없을 때만 — 그때는 콜 자리가 체크가 된다.
 * - 레이즈 = 프리셋(삥/따당/하프/풀) + 스테퍼(± 삥 단위), 최소 = 직전 베팅 초과
 * - 고스톱 방은 이 컴포넌트를 렌더하지 않는다 (점수 정산)
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
  const gameType = snapshot.room.gameType === 'poker' ? 'poker' : 'seotda'
  const labels = BET_LABELS_BY_GAME[gameType]
  const [raiseOpen, setRaiseOpen] = useState(false)
  const [raiseAmount, setRaiseAmount] = useState(0)
  const [isPending, startTransition] = useTransition()

  const round = snapshot.currentRound
  const noRoundReason = round ? null : '딜러가 판을 시작하면 베팅할 수 있습니다'
  const balance = self.balance
  const pot = round?.pot ?? 0

  /** 직전 확정 베팅 금액 — 콜 기준. */
  const lastBet = useMemo(() => {
    const accepted = snapshot.actions.filter(
      (action) => action.status === 'accepted' && action.amount > 0,
    )
    return accepted.length > 0 ? accepted[accepted.length - 1]!.amount : 0
  }, [snapshot.actions])

  const base = snapshot.room.baseBet
  const canCheck = lastBet === 0
  /** 잔액이 콜 금액보다 적으면 잔액 전부로 콜(올인 콜)한다. */
  const callAmount = Math.min(lastBet, balance)
  const callIsAllin = lastBet > 0 && balance <= lastBet
  const presets = useMemo(() => {
    const standard = raisePresets(gameType, { lastBet, pot, base })
    // 올인은 항상 마지막 프리셋 — 잔액 전부.
    return balance > 0 ? [...standard, { label: labels.allin, amount: balance }] : standard
  }, [gameType, lastBet, pot, base, balance, labels.allin])
  const minRaise = lastBet > 0 ? lastBet + 1 : base

  function fire(action: BetActionKind, amount: number) {
    if (!round || isPending) return
    startTransition(async () => {
      const success = await runAction(
        () =>
          placeBet({
            actionId: crypto.randomUUID(),
            roomId: snapshot.room.id,
            action,
            amount,
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
      if (success) {
        if (action === 'fold') playFold()
        else if (amount > 0) playChip()
        setRaiseOpen(false)
      }
    })
  }

  const disabled = !round || isPending
  const reason = noRoundReason ?? undefined

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
            : 'mx-auto w-full max-w-lg space-y-2.5 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3'
        }
      >
        <div className="flex items-center justify-between text-sm font-medium text-muted">
          <span>
            내 칩{' '}
            <span className="gilt text-base font-black tabular-nums">{balance.toLocaleString()}</span>
          </span>
          {lastBet > 0 ? (
            <span>
              받을 금액{' '}
              <span className="text-base font-black tabular-nums text-warn">
                {callAmount.toLocaleString()}
              </span>
            </span>
          ) : (
            <span>첫 베팅 전</span>
          )}
        </div>

        {raiseOpen && round ? (
          <div className="space-y-2">
            <div className={presets.length > 4 ? 'grid grid-cols-5 gap-1.5' : 'grid grid-cols-4 gap-1.5'}>
              {presets.map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  size="sm"
                  variant={raiseAmount === preset.amount ? 'primary' : 'surface'}
                  className={raiseAmount === preset.amount ? 'flex-col gap-0' : 'flex-col gap-0 border border-white/10'}
                  disabled={preset.amount > balance}
                  disabledReason={preset.amount > balance ? '잔액 부족' : undefined}
                  onClick={() => setRaiseAmount(preset.amount)}
                >
                  {preset.label}
                  <span className="tabular-nums text-[11px] leading-tight opacity-80">
                    {preset.amount.toLocaleString()}
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
                ariaLabel="레이즈 금액"
                className="flex-1"
              />
              <Button
                type="button"
                variant="primary"
                size="lg"
                className="px-6"
                disabled={isPending || raiseAmount < minRaise || raiseAmount > balance}
                disabledReason={
                  raiseAmount < minRaise
                    ? `최소 ${minRaise.toLocaleString()}`
                    : raiseAmount > balance
                      ? '잔액 부족'
                      : undefined
                }
                onClick={() => fire(raiseAmount >= balance ? 'allin' : 'raise', raiseAmount)}
              >
                {raiseAmount >= balance ? labels.allin : labels.raise} 확정
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
              disabled={disabled}
              disabledReason={reason}
              onClick={() => fire('check', 0)}
            >
              {labels.check}
            </Button>
          ) : (
            <Button
              type="button"
              variant="win"
              size="lg"
              className="flex-col gap-0 whitespace-nowrap px-1"
              disabled={disabled || callAmount < 1}
              disabledReason={reason ?? (callAmount < 1 ? '잔액 없음' : undefined)}
              onClick={() => fire(callIsAllin ? 'allin' : 'call', callAmount)}
            >
              <span className="text-lg leading-tight">{callIsAllin ? labels.allin : labels.call}</span>
              <span className="tabular-nums text-xs leading-tight opacity-90">
                {callAmount.toLocaleString()}
              </span>
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            size="lg"
            className="whitespace-nowrap px-1 text-lg"
            disabled={disabled || balance < minRaise}
            disabledReason={reason ?? (balance < minRaise ? '잔액 부족' : undefined)}
            onClick={() => {
              setRaiseAmount(presets[0]?.amount ?? minRaise)
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
            disabled={disabled}
            disabledReason={reason}
            onClick={() => fire('fold', 0)}
          >
            {labels.fold}
          </Button>
        </div>
      </div>
    </div>
  )
}
