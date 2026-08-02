'use client'

import { useMemo, useRef, useState } from 'react'
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

  // 응답이 끊겨 다시 누르는 재시도는 같은 요청 id를 재사용해 서버가 중복 확정을 흡수하게
  // 한다. 단 **확정된 뒤에는 반드시 버린다** — 안 버리면 "같은 사람에게 같은 금액을 한 번
  // 더 지급"이 서버에서 기존 바이인으로 취급돼 칩은 그대로인데 화면만 성공이라고 말한다
  // (같은 함정을 `wallet/components/credit-admin.tsx`에서 먼저 밟았다).
  //
  // 초안 키에 금액을 넣으므로 금액을 바꿔 누르면 자동으로 새 id가 나온다. 대상은 시트당
  // 고정이지만 같은 이유로 함께 넣어 둔다. 구분자는 NUL이라 금액·id 경계가 흐려지지 않는다.
  const requestIdRef = useRef<{ draft: string; id: string } | null>(null)
  function requestIdForDraft(): string {
    const draft = `${memberId}\0${buyInAmount}`
    if (!requestIdRef.current || requestIdRef.current.draft !== draft) {
      requestIdRef.current = { draft, id: crypto.randomUUID() }
    }
    return requestIdRef.current.id
  }

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
          const requestId = requestIdForDraft()
          setGranting(true)
          run(async () => {
            const success = await runAction(() =>
              addBuyIn({
                requestId,
                roomId,
                amount: buyInAmount,
                targetUserId: memberId,
              }),
            )
            if (success) requestIdRef.current = null
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
