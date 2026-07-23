'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { createRoom } from '@/features/game/actions'
import type { RoomGameType } from '@/features/game/types'
import { GAME_LABELS } from '@/features/game/labels'
import { Button, Field, Input, Panel, Stepper, useToast } from '@/components/ui'

const CHIP_PRESETS = [50, 100, 200, 500] as const
const GAME_TYPES: readonly RoomGameType[] = ['seotda', 'gostop', 'poker']

export default function NewRoomPage() {
  const router = useRouter()
  const { toast } = useToast()
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
        name: name.trim() || GAME_LABELS[gameType].name,
        gameType,
        inputMode,
        startingChips,
        pointValue: gameType === 'gostop' ? pointValue : undefined,
        baseBet: gameType === 'gostop' ? undefined : baseBet,
      })
      if (result.success) {
        router.push(`/rooms/${result.data.code}`)
      } else {
        toast(result.error, 'error')
      }
    })
  }

  return (
    <main className="mx-auto w-full max-w-xl space-y-6 px-4 pb-16 pt-8">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl text-muted">
          ←
        </Link>
        <h1 className="font-brush text-3xl font-black">방 만들기</h1>
      </header>

      <Panel className="space-y-5">
        <Field label="방 이름">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="방 이름"
            maxLength={30}
          />
        </Field>

        <Field label="게임">
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
                {GAME_LABELS[type].emoji} {GAME_LABELS[type].name}
              </Button>
            ))}
          </div>
        </Field>

        <Field label="시작 칩">
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
            ariaLabel="시작 칩"
            className="mt-2"
          />
        </Field>

        {gameType === 'gostop' ? (
          <Field label="점당 칩">
            <Stepper
              value={pointValue}
              onChange={setPointValue}
              min={1}
              max={100_000}
              ariaLabel="점당 칩"
            />
            <p className="mt-1.5 text-xs text-muted">
              판 종료 시 패자 전원이 점수 × 점당 칩을 승자에게 지불합니다
            </p>
          </Field>
        ) : (
          <Field label="삥 (베팅 기본 단위)">
            <Stepper value={baseBet} onChange={setBaseBet} min={1} max={100_000} ariaLabel="삥 단위" />
            <p className="mt-1.5 text-xs text-muted">
              레이즈 프리셋과 스테퍼가 이 단위로 움직입니다
            </p>
          </Field>
        )}

        <Field label="입력 모드">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={inputMode === 'trust' ? 'primary' : 'surface'}
              className={inputMode === 'trust' ? '' : 'border border-white/10'}
              pressed={inputMode === 'trust'}
              onClick={() => setInputMode('trust')}
            >
              바로 반영
            </Button>
            <Button
              type="button"
              variant={inputMode === 'approval' ? 'primary' : 'surface'}
              className={inputMode === 'approval' ? '' : 'border border-white/10'}
              pressed={inputMode === 'approval'}
              onClick={() => setInputMode('approval')}
            >
              딜러 승인
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {inputMode === 'trust'
              ? '각자 입력한 베팅이 바로 반영됩니다'
              : '딜러가 승인한 베팅만 반영됩니다'}
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
          {isPending ? '만드는 중…' : '방 만들기'}
        </Button>
      </Panel>
    </main>
  )
}
