'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { sendOneShotRoomEvent } from '@/lib/realtime/client'
import { translateError, useDict } from '@/lib/i18n/client'
import { updateRoomSettings } from '../actions'
import type { RoomView } from '../types'
import { Button, Field, Input, Panel, Stepper, useToast } from '@/components/ui'

/**
 * 방 옵션 편집 — 이름·입력 모드·점당 칩(고스톱)·삥 단위(베팅 게임)·정원·관전 입장.
 * 시작 칩은 대기 중(waiting)일 때만 편집할 수 있다 — 서버가 판 기록 유무를 다시 검사한다.
 */
export function RoomSettingsClient({ room }: { room: RoomView }) {
  const router = useRouter()
  const { toast } = useToast()
  const { d } = useDict()
  const [isPending, startTransition] = useTransition()

  const [name, setName] = useState(room.name)
  const [inputMode, setInputMode] = useState<'trust' | 'approval'>(room.inputMode)
  const [pointValue, setPointValue] = useState(room.pointValue)
  const [baseBet, setBaseBet] = useState(room.baseBet)
  const [startingChips, setStartingChips] = useState(room.startingChips)
  const [maxMembers, setMaxMembers] = useState(room.maxMembers)
  const [joinAsObserver, setJoinAsObserver] = useState(room.joinAsObserver)

  const isGostop = room.gameType === 'gostop'
  // 첫 판 전에만 시작 칩 변경 허용 — 진행 중 변경은 손익·팟 계산의 기준을 흔든다.
  const canEditStartingChips = room.status === 'waiting'

  function save() {
    if (isPending) return
    startTransition(async () => {
      const result = await updateRoomSettings({
        roomId: room.id,
        name: name.trim() || room.name,
        inputMode,
        pointValue: isGostop ? pointValue : undefined,
        baseBet: isGostop ? undefined : baseBet,
        // 같은 값 재전송은 서버가 no-op 으로 통과시킨다 — 대기 중이면 항상 보내도 안전하다.
        startingChips: canEditStartingChips ? startingChips : undefined,
        maxMembers,
        joinAsObserver,
      })
      if (result.success) {
        // 설정 페이지는 채널 미구독 — 원샷 브로드캐스트로 방 화면 피어가 즉시 refetch 하게 한다.
        // 이 페이지는 방장 전용이라 actorId 는 hostId 로 충분하다. 실패해도 폴링이 복구한다.
        void sendOneShotRoomEvent(room.id, room.hostId, 'room.settings_changed', {})
        toast(d.settings.saved, 'success')
        router.push(`/rooms/${room.code}`)
      } else {
        toast(translateError(d, result.error), 'error')
      }
    })
  }

  return (
    <main className="mx-auto w-full max-w-xl space-y-6 px-4 pb-16 pt-8">
      <header className="flex items-center gap-3">
        <Link
          href={`/rooms/${room.code}`}
          className="text-2xl text-muted"
          aria-label={d.room.backAria}
        >
          ←
        </Link>
        <div>
          <h1 className="font-brush text-3xl font-black">{d.settings.title}</h1>
          <p className="mt-0.5 text-xs text-muted">
            {d.games[room.gameType]} · {d.room.codeLabel}{' '}
            <span className="font-mono font-bold tracking-widest">{room.code}</span>
          </p>
        </div>
      </header>

      <Panel className="space-y-5">
        <Field label={d.roomForm.nameLabel}>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={30}
            placeholder={d.roomForm.namePlaceholder}
          />
        </Field>

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

        {isGostop ? (
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

        <Field label={d.roomForm.startingChipsLabel}>
          {canEditStartingChips ? (
            <>
              <Stepper
                value={startingChips}
                onChange={setStartingChips}
                min={1}
                max={1_000_000}
                step={10}
                ariaLabel={d.roomForm.startingChipsAria}
              />
              <p className="mt-1.5 text-xs text-muted">{d.settings.startingChipsEditHint}</p>
            </>
          ) : (
            <>
              <p className="tabular-nums text-lg font-black">
                {room.startingChips.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-muted">{d.settings.startingChipsLocked}</p>
            </>
          )}
        </Field>

        <Field label={d.settings.maxMembersLabel}>
          <Stepper
            value={maxMembers}
            onChange={setMaxMembers}
            min={2}
            max={10}
            ariaLabel={d.settings.maxMembersLabel}
          />
          <p className="mt-1.5 text-xs text-muted">{d.settings.maxMembersHint}</p>
        </Field>

        <div>
          <Button
            type="button"
            variant={joinAsObserver ? 'primary' : 'surface'}
            className={
              joinAsObserver
                ? 'w-full justify-between'
                : 'w-full justify-between border border-white/10'
            }
            pressed={joinAsObserver}
            onClick={() => setJoinAsObserver((value) => !value)}
          >
            <span>{d.settings.joinAsObserverLabel}</span>
            <span className="text-sm opacity-80" aria-hidden>
              {joinAsObserver ? d.settings.joinAsObserverOn : d.settings.joinAsObserverOff}
            </span>
          </Button>
          <p className="mt-1.5 text-xs text-muted">{d.settings.joinAsObserverHint}</p>
        </div>

        <Button
          type="button"
          variant="primary"
          size="lg"
          className="w-full"
          disabled={isPending}
          onClick={save}
        >
          {isPending ? d.common.saving : d.common.save}
        </Button>
      </Panel>
    </main>
  )
}
