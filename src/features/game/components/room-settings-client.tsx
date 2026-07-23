'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { updateRoomSettings } from '../actions'
import type { RoomView } from '../types'
import { Button, Field, Input, Panel, Stepper, useToast } from '@/components/ui'
import { GAME_LABELS } from './shared'

/** 방 옵션 편집 — 이름·입력 모드·점당 칩(고스톱)·삥 단위(베팅 게임). */
export function RoomSettingsClient({ room }: { room: RoomView }) {
  const router = useRouter()
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()

  const [name, setName] = useState(room.name)
  const [inputMode, setInputMode] = useState<'trust' | 'approval'>(room.inputMode)
  const [pointValue, setPointValue] = useState(room.pointValue)
  const [baseBet, setBaseBet] = useState(room.baseBet)

  const isGostop = room.gameType === 'gostop'

  function save() {
    if (isPending) return
    startTransition(async () => {
      const result = await updateRoomSettings({
        roomId: room.id,
        name: name.trim() || room.name,
        inputMode,
        pointValue: isGostop ? pointValue : undefined,
        baseBet: isGostop ? undefined : baseBet,
      })
      if (result.success) {
        toast('방 옵션을 저장했습니다', 'success')
        router.push(`/rooms/${room.code}`)
      } else {
        toast(result.error, 'error')
      }
    })
  }

  return (
    <main className="mx-auto w-full max-w-xl space-y-6 px-4 pb-16 pt-8">
      <header className="flex items-center gap-3">
        <Link href={`/rooms/${room.code}`} className="text-2xl text-muted">
          ←
        </Link>
        <div>
          <h1 className="font-brush text-3xl font-black">방 옵션</h1>
          <p className="mt-0.5 text-xs text-muted">
            {GAME_LABELS[room.gameType].name} · 코드{' '}
            <span className="font-mono font-bold tracking-widest">{room.code}</span>
          </p>
        </div>
      </header>

      <Panel className="space-y-5">
        <Field label="방 이름">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={30}
            placeholder="방 이름"
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
              바로 반영
            </Button>
            <Button
              type="button"
              variant={inputMode === 'approval' ? 'primary' : 'surface'}
              className={inputMode === 'approval' ? '' : 'border border-white/10'}
              onClick={() => setInputMode('approval')}
            >
              딜러 승인
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {inputMode === 'trust'
              ? '각자 입력한 베팅이 바로 반영됩니다.'
              : '딜러가 승인한 베팅만 반영됩니다.'}
          </p>
        </Field>

        {isGostop ? (
          <Field label="점당 칩">
            <Stepper
              value={pointValue}
              onChange={setPointValue}
              min={1}
              max={100_000}
              ariaLabel="점당 칩"
            />
            <p className="mt-1.5 text-xs text-muted">
              판 종료 시 패자 전원이 점수 × 점당 칩을 승자에게 지불합니다.
            </p>
          </Field>
        ) : (
          <Field label="삥 (베팅 기본 단위)">
            <Stepper value={baseBet} onChange={setBaseBet} min={1} max={100_000} ariaLabel="삥 단위" />
            <p className="mt-1.5 text-xs text-muted">
              레이즈 스테퍼와 프리셋이 이 단위로 움직입니다. 기본값은 시작 칩의 1%입니다.
            </p>
          </Field>
        )}

        <Field label="시작 칩">
          <p className="tabular-nums text-lg font-black">{room.startingChips.toLocaleString()}</p>
          <p className="mt-1 text-xs text-muted">
            시작 칩은 진행 중 바꿀 수 없습니다. 부족한 사람은 좌석 탭 → 추가 바이인을 쓰세요.
          </p>
        </Field>

        <Button
          type="button"
          variant="primary"
          size="lg"
          className="w-full"
          disabled={isPending}
          onClick={save}
        >
          {isPending ? '저장 중…' : '저장'}
        </Button>
      </Panel>
    </main>
  )
}
