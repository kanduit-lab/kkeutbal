'use client'

import { clsx } from 'clsx'
import { useMemo, useState } from 'react'
import { addBuyIn } from '@/features/budget/actions'
import { format, useDict } from '@/lib/i18n/client'
import { Button, Stepper } from '@/components/ui'
import type { RunAction } from './shared'
import { Section } from './member-sheet-parts'

/**
 * 바이인 섹션 — 딜러가 멤버에게 칩을 지급한다. "지급 취소"는 undoLastBuyIn 확인
 * 다이얼로그를 여는 요청만 올리고, 다이얼로그 자체는 MemberSheet 가 소유한다.
 */
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
        step={baseBet}
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
                roomId,
                amount: buyInAmount,
                targetUserId: memberId,
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
        disabled={isPending || memberBuyInTotal <= 0}
        disabledReason={memberBuyInTotal <= 0 ? d.memberSheet.nothingToUndo : undefined}
        onClick={onUndoRequest}
      >
        ↩ {d.memberSheet.undoLast}
      </Button>
    </Section>
  )
}
