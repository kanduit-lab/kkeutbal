'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { sendOneShotRoomEvent } from '@/lib/realtime/client'
import { translateError, useDict } from '@/lib/i18n/client'
import { updateRoomSettings } from '../actions'
import {
  BASE_BET_PRESETS,
  BASE_BET_STEP,
  CHIP_STEP,
  POINT_VALUE_STEP,
} from '../room-form-defaults'
import type { RoomView } from '../types'
import { Button, Field, Input, Panel, Segmented, Stepper, useToast } from '@/components/ui'

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
  const [fairDealing, setFairDealing] = useState(room.fairPlay.dealing)
  const [seedCollectionSeconds, setSeedCollectionSeconds] = useState(
    room.fairPlay.seedCollectionSeconds,
  )

  const isGostop = room.gameType === 'gostop'
  const supportsVerifiedFairDeal = room.gameType === 'seotda'

  // 계정 크레딧 방은 시작 칩을 못 바꾼다. 소급 지급·회수(`applyStartingChipsAdjustment`)가
  // 세션 원장만 움직이고 지갑 잠금은 그대로 두기 때문에 서버가 거절한다. 예전에는 스테퍼가
  // 그대로 열려 있어서, 방장이 값을 바꿔 저장하면 이유 없는 실패 토스트만 반복됐다.
  const isAccountCredit = room.fundingMode === 'account_credit'
  const canEditStartingChips = room.status === 'waiting' && !isAccountCredit

  function save() {
    if (isPending) return
    startTransition(async () => {
      const result = await updateRoomSettings({
        roomId: room.id,
        name: name.trim() || room.name,
        inputMode,
        pointValue: isGostop ? pointValue : undefined,
        baseBet: isGostop ? undefined : baseBet,
        startingChips: canEditStartingChips ? startingChips : undefined,
        maxMembers,
        joinAsObserver,
        fairPlay: supportsVerifiedFairDeal
          ? {
              dealing: fairDealing,
              seedCollectionSeconds,
              turnTimeoutSeconds: room.fairPlay.turnTimeoutSeconds,
              timeoutPolicy: 'pause',
            }
          : undefined,
      })
      if (result.success) {
        void sendOneShotRoomEvent(room.id, room.hostId, 'room.settings_changed', {})
        toast(d.settings.saved, 'success')
        router.push(`/rooms/${room.code}`)
      } else {
        toast(translateError(d, result.error), 'error')
      }
    })
  }

  return (
    <main id="main" className="mx-auto w-full max-w-xl space-y-6 px-4 pb-16 pt-8">
      <header className="flex items-center gap-3">
        <Link
          href={`/rooms/${room.code}`}
          className="inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center text-2xl text-muted transition-colors hover:text-text"
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
        <Field label={d.inputMode.label} group>
          <Segmented
            value={inputMode}
            onChange={setInputMode}
            ariaLabel={d.inputMode.label}
            className="grid-cols-2"
            options={[
              { value: 'trust', label: d.inputMode.trust },
              { value: 'approval', label: d.inputMode.approval },
            ]}
          />
          <p className="mt-1.5 text-xs text-muted">
            {inputMode === 'trust' ? d.inputMode.trustHint : d.inputMode.approvalHint}
          </p>
        </Field>
        {isGostop ? (
          <Field label={d.roomForm.pointValueLabel} group>
            <Stepper
              value={pointValue}
              onChange={setPointValue}
              min={1}
              max={100_000}
              step={POINT_VALUE_STEP}
              ariaLabel={d.roomForm.pointValueAria}
              decreaseLabel={d.ui.decrease}
              increaseLabel={d.ui.increase}
            />
            <p className="mt-1.5 text-xs text-muted">{d.roomForm.pointValueHint}</p>
          </Field>
        ) : (
          <Field label={d.roomForm.baseBetLabel} group>
            <div className="grid grid-cols-4 gap-2">
              {BASE_BET_PRESETS.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  selected={baseBet === preset}
                  onClick={() => setBaseBet(preset)}
                >
                  {preset.toLocaleString()}
                </Button>
              ))}
            </div>
            <Stepper
              value={baseBet}
              onChange={setBaseBet}
              min={1}
              max={100_000}
              step={BASE_BET_STEP}
              ariaLabel={d.roomForm.baseBetAria}
              decreaseLabel={d.ui.decrease}
              increaseLabel={d.ui.increase}
              className="mt-2"
            />
            <p className="mt-1.5 text-xs text-muted">{d.roomForm.baseBetHint}</p>
          </Field>
        )}

        <Field label={d.roomForm.startingChipsLabel} group>
          {canEditStartingChips ? (
            <>
              <Stepper
                value={startingChips}
                onChange={setStartingChips}
                min={1}
                max={1_000_000}
                step={CHIP_STEP}
                ariaLabel={d.roomForm.startingChipsAria}
                decreaseLabel={d.ui.decrease}
                increaseLabel={d.ui.increase}
              />
              <p className="mt-1.5 text-xs text-muted">{d.settings.startingChipsEditHint}</p>
            </>
          ) : (
            <>
              <p className="tabular-nums text-lg font-black">
                {room.startingChips.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-muted">
                {isAccountCredit
                  ? d.settings.startingChipsCreditLocked
                  : d.settings.startingChipsLocked}
              </p>
            </>
          )}
        </Field>
        <Field label={d.settings.maxMembersLabel} group>
          <Stepper
            value={maxMembers}
            onChange={setMaxMembers}
            min={2}
            max={10}
            ariaLabel={d.settings.maxMembersLabel}
            decreaseLabel={d.ui.decrease}
            increaseLabel={d.ui.increase}
          />
          <p className="mt-1.5 text-xs text-muted">{d.settings.maxMembersHint}</p>
        </Field>
        <div>
          <Button
            type="button"
            selected={joinAsObserver}
            className="w-full justify-between"
            onClick={() => setJoinAsObserver((value) => !value)}
          >
            <span>{d.settings.joinAsObserverLabel}</span>
            <span className="text-sm opacity-80" aria-hidden>
              {joinAsObserver ? d.settings.joinAsObserverOn : d.settings.joinAsObserverOff}
            </span>
          </Button>
          <p className="mt-1.5 text-xs text-muted">{d.settings.joinAsObserverHint}</p>
        </div>
        {supportsVerifiedFairDeal ? (
          <Field label={d.fairness.settingsLabel} group>
            <Button
              type="button"
              selected={fairDealing === 'verified'}
              className="w-full justify-between"
              disabled={room.status !== 'waiting'}
              disabledReason={room.status !== 'waiting' ? d.fairness.settingsLocked : undefined}
              onClick={() =>
                setFairDealing((current) => (current === 'verified' ? 'manual' : 'verified'))
              }
            >
              <span>
                {fairDealing === 'verified'
                  ? d.fairness.verifiedEnabled
                  : d.fairness.verifiedDisabled}
              </span>
              <span className="text-sm opacity-80" aria-hidden>
                {fairDealing === 'verified' ? 'ON' : 'OFF'}
              </span>
            </Button>
            <p className="mt-1.5 text-xs text-muted">{d.fairness.verifiedHint}</p>
            {fairDealing === 'verified' ? (
              <div className="mt-3">
                <p className="mb-1 text-xs font-medium">{d.fairness.seedTimeoutLabel}</p>
                <Stepper
                  value={seedCollectionSeconds}
                  onChange={setSeedCollectionSeconds}
                  min={10}
                  max={120}
                  step={5}
                  ariaLabel={d.fairness.seedTimeoutLabel}
                  decreaseLabel={d.ui.decrease}
                  increaseLabel={d.ui.increase}
                />
                <p className="mt-1.5 text-xs text-muted">{d.fairness.seedTimeoutHint}</p>
              </div>
            ) : null}
          </Field>
        ) : null}

        <Button
          type="button"
          variant="primary"
          size="lg"
          className="w-full"
          loading={isPending}
          loadingLabel={d.common.saving}
          onClick={save}
        >
          {d.common.save}
        </Button>
      </Panel>
    </main>
  )
}