'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { createRoom } from '@/features/game/actions'
import type { FundingMode, RoomGameType } from '@/features/game/types'
import { GAME_LABELS } from '@/features/game/labels'
import { translateError, useDict } from '@/lib/i18n/client'
import { Button, ConfirmDialog, Field, Input, Panel, Stepper, useToast } from '@/components/ui'

const CHIP_PRESETS = [50, 100, 200, 500] as const
const GAME_TYPES: readonly RoomGameType[] = ['seotda', 'gostop', 'poker']

export default function NewRoomPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { d } = useDict()
  const [isPending, startTransition] = useTransition()

  const [name, setName] = useState('')
  const [gameType, setGameType] = useState<RoomGameType>('seotda')
  const [inputMode, setInputMode] = useState<'trust' | 'approval'>('trust')
  const [startingChips, setStartingChips] = useState(100)
  const [pointValue, setPointValue] = useState(10)
  const [baseBet, setBaseBet] = useState(1)
  const [fundingMode, setFundingMode] = useState<FundingMode>('session')
  const [accountCreditConfirmOpen, setAccountCreditConfirmOpen] = useState(false)

  function create() {
    if (isPending) return
    startTransition(async () => {
      const result = await createRoom({
        name: name.trim() || d.games[gameType],
        gameType,
        inputMode,
        startingChips,
        pointValue: gameType === 'gostop' ? pointValue : undefined,
        baseBet: gameType === 'gostop' ? undefined : baseBet,
        fundingMode,
      })
      if (result.success) {
        router.push(`/rooms/${result.data.code}`)
      } else {
        toast(translateError(d, result.error), 'error')
      }
    })
  }

  function submit() {
    if (isPending) return
    if (fundingMode === 'account_credit') {
      setAccountCreditConfirmOpen(true)
      return
    }
    create()
  }

  return (
    <main className="mx-auto w-full max-w-xl space-y-6 px-4 pb-16 pt-8">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl text-muted">
          ←
        </Link>
        <h1 className="font-brush text-3xl font-black">{d.newRoom.title}</h1>
      </header>

      <Panel className="space-y-5">
        <Field label={d.roomForm.nameLabel}>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={d.roomForm.namePlaceholder}
            maxLength={30}
          />
        </Field>

        <Field label={d.roomForm.gameLabel}>
          <div className="grid grid-cols-3 gap-2">
            {GAME_TYPES.map((type) => (
              <Button
                key={type}
                type="button"
                variant={gameType === type ? 'primary' : 'surface'}
                className={gameType === type ? '' : 'border border-white/10'}
                pressed={gameType === type}
                onClick={() => setGameType(type)}
              >
                {GAME_LABELS[type].emoji} {d.games[type]}
              </Button>
            ))}
          </div>
        </Field>

        <Field label={d.roomForm.startingChipsLabel}>
          <div className="grid grid-cols-4 gap-2">
            {CHIP_PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                size="sm"
                variant={startingChips === preset ? 'primary' : 'surface'}
                className={startingChips === preset ? '' : 'border border-white/10'}
                pressed={startingChips === preset}
                onClick={() => setStartingChips(preset)}
              >
                {preset}
              </Button>
            ))}
          </div>
          <Stepper
            value={startingChips}
            onChange={setStartingChips}
            min={1}
            max={1_000_000}
            step={10}
            ariaLabel={d.roomForm.startingChipsAria}
            className="mt-2"
          />
        </Field>

        <Field label={d.roomForm.fundingModeLabel}>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={fundingMode === 'session' ? 'primary' : 'surface'}
              className={fundingMode === 'session' ? '' : 'border border-white/10'}
              pressed={fundingMode === 'session'}
              onClick={() => setFundingMode('session')}
            >
              {d.roomForm.sessionFunding}
            </Button>
            <Button
              type="button"
              variant={fundingMode === 'account_credit' ? 'primary' : 'surface'}
              className={fundingMode === 'account_credit' ? '' : 'border border-white/10'}
              pressed={fundingMode === 'account_credit'}
              onClick={() => setFundingMode('account_credit')}
            >
              {d.roomForm.accountCreditFunding}
            </Button>
          </div>
          <p className="mt-2 text-sm text-muted">
            {fundingMode === 'account_credit'
              ? d.roomForm.accountCreditFundingHint
              : d.roomForm.sessionFundingHint}
          </p>
        </Field>

        {gameType === 'gostop' ? (
          <Field label={d.roomForm.pointValueLabel}>
            <Stepper
              value={pointValue}
              onChange={setPointValue}
              min={1}
              max={100_000}
              ariaLabel={d.roomForm.pointValueAria}
            />
            <p className="mt-1.5 text-xs text-muted">{d.roomForm.pointValueHint}</p>
          </Field>
        ) : (
          <Field label={d.roomForm.baseBetLabel}>
            <Stepper
              value={baseBet}
              onChange={setBaseBet}
              min={1}
              max={100_000}
              ariaLabel={d.roomForm.baseBetAria}
            />
            <p className="mt-1.5 text-xs text-muted">{d.roomForm.baseBetHint}</p>
          </Field>
        )}

        <Field label={d.inputMode.label}>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={inputMode === 'trust' ? 'primary' : 'surface'}
              className={inputMode === 'trust' ? '' : 'border border-white/10'}
              pressed={inputMode === 'trust'}
              onClick={() => setInputMode('trust')}
            >
              {d.inputMode.trust}
            </Button>
            <Button
              type="button"
              variant={inputMode === 'approval' ? 'primary' : 'surface'}
              className={inputMode === 'approval' ? '' : 'border border-white/10'}
              pressed={inputMode === 'approval'}
              onClick={() => setInputMode('approval')}
            >
              {d.inputMode.approval}
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {inputMode === 'trust' ? d.inputMode.trustHint : d.inputMode.approvalHint}
          </p>
        </Field>

        <Button
          type="button"
          variant="primary"
          size="lg"
          className="w-full"
          disabled={isPending}
          onClick={submit}
        >
          {isPending ? d.newRoom.creating : d.newRoom.create}
        </Button>
      </Panel>

      <ConfirmDialog
        open={accountCreditConfirmOpen}
        title={d.roomForm.accountCreditConfirmTitle}
        body={d.roomForm.accountCreditConfirmBody}
        confirmLabel={d.roomForm.accountCreditConfirmLabel}
        cancelLabel={d.common.cancel}
        onConfirm={() => {
          setAccountCreditConfirmOpen(false)
          create()
        }}
        onClose={() => setAccountCreditConfirmOpen(false)}
      />
    </main>
  )
}
