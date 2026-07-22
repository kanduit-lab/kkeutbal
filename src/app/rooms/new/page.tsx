'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { createRoom } from '@/features/game/actions'
import type { RoomGameType } from '@/features/game/types'
import { GAME_LABELS } from '@/features/game/components/shared'
import { Button, Field, Input, Panel, useToast } from '@/components/ui'

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

  function submit() {
    if (isPending) return
    startTransition(async () => {
      const result = await createRoom({
        name: name.trim() || `${GAME_LABELS[gameType].name} 한 판`,
        gameType,
        inputMode,
        startingChips,
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
        <h1 className="font-brush text-3xl font-black">새 판 벌이기</h1>
      </header>

      <Panel className="space-y-5">
        <Field label="방 이름">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="예: 3박4일 MT 섯다"
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
                onClick={() => setStartingChips(preset)}
              >
                {preset}
              </Button>
            ))}
          </div>
          <Input
            type="number"
            min={1}
            max={1_000_000}
            value={startingChips}
            onChange={(event) => setStartingChips(Math.max(1, Number(event.target.value) || 1))}
            className="mt-2"
          />
        </Field>

        <Field label="입력 모드">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={inputMode === 'trust' ? 'primary' : 'surface'}
              className={inputMode === 'trust' ? '' : 'border border-white/10'}
              onClick={() => setInputMode('trust')}
            >
              신뢰 모드
            </Button>
            <Button
              type="button"
              variant={inputMode === 'approval' ? 'primary' : 'surface'}
              className={inputMode === 'approval' ? '' : 'border border-white/10'}
              onClick={() => setInputMode('approval')}
            >
              승인 모드
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {inputMode === 'trust'
              ? '입력하는 대로 바로 반영됩니다.'
              : '딜러가 승인한 베팅만 반영됩니다.'}
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
