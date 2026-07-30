'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { createRoom } from '@/features/game/actions'
import type { FundingMode, RoomGameType } from '@/features/game/types'
import { GAME_LABELS } from '@/features/game/labels'
import type { RaiseRule } from '@/features/betting/raise-rule'
import { translateError, useDict } from '@/lib/i18n/client'
import {
  Button,
  ConfirmDialog,
  Field,
  FixedBody,
  FixedPage,
  Input,
  PageHeader,
  Panel,
  ScrollPane,
  Stepper,
  useToast,
} from '@/components/ui'
import { LocaleSwitcher } from '@/components/locale-switcher'

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
  const [raiseRule, setRaiseRule] = useState<RaiseRule>('free')
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
        raiseRule: gameType === 'gostop' ? undefined : raiseRule,
      })
      if (result.success) {
        setAccountCreditConfirmOpen(false)
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
    <FixedPage width="content">
      <PageHeader
        className="mb-4 shrink-0"
        title={d.newRoom.title}
        backHref="/"
        backLabel={d.common.home}
        actions={<LocaleSwitcher />}
      />
      <FixedBody>
        <Panel className="flex min-h-0 flex-1 flex-col gap-4">
          <ScrollPane label={d.newRoom.title} className="pe-1">
            <div className="grid gap-5 lg:grid-cols-2 lg:gap-x-6 lg:gap-y-5">
              <div className="lg:col-span-2">
                <Field label={d.roomForm.nameLabel}>
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={d.roomForm.namePlaceholder}
                    maxLength={30}
                  />
                </Field>
              </div>
              <div className="lg:col-span-2">
                <Field label={d.roomForm.gameLabel} group>
                  <div className="grid grid-cols-3 gap-2">
                    {GAME_TYPES.map((type) => (
                      <Button
                        key={type}
                        type="button"
                        selected={gameType === type}
                        onClick={() => setGameType(type)}
                      >
                        {GAME_LABELS[type].emoji} {d.games[type]}
                      </Button>
                    ))}
                  </div>
                </Field>
              </div>
              <Field label={d.roomForm.startingChipsLabel} group>
                <div className="grid grid-cols-4 gap-2">
                  {CHIP_PRESETS.map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      size="sm"
                      selected={startingChips === preset}
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
                  decreaseLabel={d.ui.decrease}
                  increaseLabel={d.ui.increase}
                  className="mt-2"
                />
              </Field>
              <Field label={d.roomForm.fundingModeLabel} group>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    selected={fundingMode === 'session'}
                    onClick={() => setFundingMode('session')}
                  >
                    {d.roomForm.sessionFunding}
                  </Button>
                  <Button
                    type="button"
                    selected={fundingMode === 'account_credit'}
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
                    decreaseLabel={d.ui.decrease}
                    increaseLabel={d.ui.increase}
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
                    decreaseLabel={d.ui.decrease}
                    increaseLabel={d.ui.increase}
                  />
                  <p className="mt-1.5 text-xs text-muted">{d.roomForm.baseBetHint}</p>
                </Field>
              )}

              {gameType !== 'gostop' ? (
                <div className="lg:col-span-2">
                  <Field label={d.roomForm.raiseRuleLabel} group>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        type="button"
                        selected={raiseRule === 'free'}
                        onClick={() => setRaiseRule('free')}
                      >
                        {d.roomForm.raiseRuleFree}
                      </Button>
                      <Button
                        type="button"
                        selected={raiseRule === 'ttadang'}
                        onClick={() => setRaiseRule('ttadang')}
                      >
                        {d.roomForm.raiseRuleTtadang}
                      </Button>
                      <Button
                        type="button"
                        selected={raiseRule === 'pot_limit'}
                        onClick={() => setRaiseRule('pot_limit')}
                      >
                        {d.roomForm.raiseRulePotLimit}
                      </Button>
                    </div>
                    <p className="mt-1.5 text-xs text-muted">
                      {raiseRule === 'free'
                        ? d.roomForm.raiseRuleFreeHint
                        : raiseRule === 'ttadang'
                          ? d.roomForm.raiseRuleTtadangHint
                          : d.roomForm.raiseRulePotLimitHint}
                    </p>
                  </Field>
                </div>
              ) : null}

              <div className="lg:col-span-2">
                <Field label={d.inputMode.label} group>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      selected={inputMode === 'trust'}
                      onClick={() => setInputMode('trust')}
                    >
                      {d.inputMode.trust}
                    </Button>
                    <Button
                      type="button"
                      selected={inputMode === 'approval'}
                      onClick={() => setInputMode('approval')}
                    >
                      {d.inputMode.approval}
                    </Button>
                  </div>
                  <p className="mt-1.5 text-xs text-muted">
                    {inputMode === 'trust' ? d.inputMode.trustHint : d.inputMode.approvalHint}
                  </p>
                </Field>
              </div>
            </div>
          </ScrollPane>
          <Button
            type="button"
            variant="primary"
            size="lg"
            className="w-full shrink-0"
            loading={isPending}
            loadingLabel={d.newRoom.creating}
            onClick={submit}
          >
            {d.newRoom.create}
          </Button>
        </Panel>
      </FixedBody>
      <ConfirmDialog
        open={accountCreditConfirmOpen}
        title={d.roomForm.accountCreditConfirmTitle}
        body={d.roomForm.accountCreditConfirmBody}
        confirmLabel={d.roomForm.accountCreditConfirmLabel}
        cancelLabel={d.common.cancel}
        loading={isPending}
        onConfirm={create}
        onClose={() => setAccountCreditConfirmOpen(false)}
      />
    </FixedPage>
  )
}
