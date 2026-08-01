'use client'

import { useMemo, useState } from 'react'
import { addBuyIn } from '@/features/budget/actions'
import { format, useDict } from '@/lib/i18n/client'
import { Button, Stepper } from '@/components/ui'
import type { RunAction } from './shared'
import { Section } from './member-sheet-parts'
import { STACK_AMOUNT_CLASS, STACK_BUTTON_CLASS } from './button-recipes'

export function BuyInSection({
  roomId,
  memberId,
  memberBuyInTotal,
  startingChips,
  baseBet,
  isPending,
  run,
  runAction,
  onUndoRequest,
}: {
  roomId: string
  memberId: string
  memberBuyInTotal: number
  startingChips: number
  baseBet: number
  isPending: boolean
  run: (task: () => Promise<boolean>, closeAfter?: boolean) => void
  runAction: RunAction
  onUndoRequest: () => void
}) {
  const { d } = useDict()
  const [buyInAmount, setBuyInAmount] = useState(startingChips)

  const [granting, setGranting] = useState(false)

  const buyInPresets = useMemo(() => {
    const half = Math.max(1, Math.round(startingChips / 2))
    return [
      { label: d.memberSheet.presetStartingChips, amount: startingChips },
      { label: d.memberSheet.presetHalf, amount: half },
    ]
  }, [startingChips, d])

  return (
    <Section icon="💰" title={d.memberSheet.buyInTitle} hint={d.memberSheet.buyInHint}>
      <div className="grid grid-cols-2 gap-2">
        {buyInPresets.map((preset) => (
          <Button
            key={preset.label}
            selected={buyInAmount === preset.amount}
            className={STACK_BUTTON_CLASS}
            onClick={() => setBuyInAmount(preset.amount)}
          >
            {preset.label}
            <span className={STACK_AMOUNT_CLASS}>+{preset.amount.toLocaleString()}</span>
          </Button>
        ))}
      </div>
      <Stepper
        value={buyInAmount}
        onChange={setBuyInAmount}
        min={1}
        max={1_000_000}
        step={baseBet}
        ariaLabel={d.memberSheet.buyInAria}
        decreaseLabel={d.ui.decrease}
        increaseLabel={d.ui.increase}
      />
      <Button
        variant="win"
        size="lg"
        className="w-full"
        loading={granting}
        loadingLabel={d.ui.processing}
        disabled={isPending}
        onClick={() => {
          setGranting(true)
          run(async () => {
            const success = await runAction(() =>
              addBuyIn({
                roomId,
                amount: buyInAmount,
                targetUserId: memberId,
              }),
            )
            setGranting(false)
            return success
          }, false)
        }}
      >
        💰 {format(d.memberSheet.grant, { n: buyInAmount.toLocaleString() })}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="w-full"
        disabled={isPending || memberBuyInTotal <= 0}
        disabledReason={memberBuyInTotal <= 0 ? d.memberSheet.nothingToUndo : undefined}
        aria-haspopup="dialog"
        onClick={onUndoRequest}
      >
        ↩ {d.memberSheet.undoLast}
      </Button>
    </Section>
  )
}
