'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { createRoom } from '@/features/game/actions'
import type { RoomGameType } from '@/features/game/types'
import { GAME_LABELS } from '@/features/game/labels'
import { translateError, useDict } from '@/lib/i18n/client'
import { Button, Field, Input, Panel, Stepper, useToast } from '@/components/ui'

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

  function submit() {
    if (isPending) return
    startTransition(async () => {
      const result = await createRoom({
        name: name.trim() || d.games[gameType],
        gameType,
        inputMode,
        startingChips,
        pointValue: gameType === 'gostop' ? pointValue : undefined,
        baseBet: gameType === 'gostop' ? undefined : baseBet,
      })
      if (result.success) {
        router.push(`/rooms/${result.data.code}`)
      } else {
        toast(translateError(d, result.error), 'error')
      }
    })
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
    </main>
  )
}
