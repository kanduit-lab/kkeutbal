'use client'

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
  /**
   * isPending 은 시트 전체가 공유한다 — 역할 변경이나 대리 베팅이 도는 동안에도 참이라
   * 그것만 보고 스피너를 붙이면 엉뚱한 버튼이 돈다. 이 섹션이 쏜 요청만 따로 표시한다.
   */
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
            size="sm"
            selected={buyInAmount === preset.amount}
            className="flex-col gap-0"
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
          run(
            async () => {
              const success = await runAction(() =>
                addBuyIn({
                  roomId,
                  amount: buyInAmount,
                  targetUserId: memberId,
                }),
              )
              setGranting(false)
              return success
            },
            // 시트를 열어 둬 잔액이 올라간 것을 바로 확인하게 한다 — 지급 취소 경로와 같은 규칙.
            // 여러 명에게 연속 지급할 때 매번 좌석을 다시 탭하지 않아도 된다.
            false,
          )
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
