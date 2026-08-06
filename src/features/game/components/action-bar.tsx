'use client'

import type { ReactNode } from 'react'
import type { MemberView, RoomSnapshot } from '../types'
import { Button, Stepper, useToast } from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'
import { betLabelsFor, formatChips, type RunAction } from './shared'
import { useActionBarControls } from './use-action-bar-controls'
import { GRID_BUTTON_CLASS, STACK_AMOUNT_CLASS, STACK_BUTTON_CLASS } from './button-recipes'

export function ActionBar({
  snapshot,
  self,
  runAction,
  staleReason = null,
  inline = false,
  showBetting = true,
  dealerSlot = null,
}: {
  snapshot: RoomSnapshot
  self: MemberView
  runAction: RunAction

  staleReason?: string | null

  inline?: boolean

  /** false면 베팅 UI(칩/콜/레이즈/폴드)를 숨기고 dealerSlot만 보여준다 — 고스톱처럼 베팅이 없는 게임의 모바일 딜러 전용 바 */
  showBetting?: boolean

  /** 모바일 하단 바에 얹는 딜러 컴팩트 컨트롤(DealerQuickBar). 있으면 베팅 영역 위에 한 줄로 붙는다 */
  dealerSlot?: ReactNode
}) {
  const { d, locale } = useDict()
  const gameType = snapshot.room.gameType === 'poker' ? 'poker' : 'seotda'
  const labels = betLabelsFor(snapshot.room.gameType, d)
  const { toast } = useToast()

  const {
    barRef,
    round,
    gateReason,
    raiseOpen,
    setRaiseOpen,
    raiseAmount,
    setRaiseAmount,
    isPending,
    firingSlot,
    presets,
    minRaise,
    minRaiseRounded,
    lastBet,
    needed,
    canCheck,
    callAmount,
    callIsAllin,
    cannotCoverCallReason,
    disabled,
    reason,
    fire,
  } = useActionBarControls({
    snapshot,
    self,
    runAction,
    staleReason,
    inline,
    gameType,
    labels,
    d,
    toast,
  })

  const balance = self.balance
  const base = snapshot.room.baseBet

  return (
    <div
      ref={barRef}
      className={
        inline
          ? 'lacquer mt-4 rounded-2xl'
          : 'fixed inset-x-0 bottom-0 z-40 border-t border-gold/15 bg-bg-deep/95 backdrop-blur'
      }
    >
      <div
        className={
          inline
            ? 'space-y-3 p-5'
            : // `px-4`는 방 화면 `main`의 좌우 여백과 같은 값이다. px-3 이던 시절에는 하단
              // 고정 바만 4px 넓게 퍼져서, 바로 위 SelfBar 와 세로 모서리가 어긋나 보였다.
              'mx-auto w-full max-w-lg space-y-2.5 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3'
        }
      >
        {dealerSlot ? (
          <div className={showBetting ? 'border-b border-white/10 pb-2.5' : undefined}>
            {dealerSlot}
          </div>
        ) : null}
        {showBetting ? (
          <>
            <div className="flex items-center justify-between text-sm font-medium text-muted">
              <span>
                {d.actionBar.myChips}{' '}
                <span className="gilt text-base font-black tabular-nums">
                  {formatChips(balance, locale)}
                </span>
              </span>
              {needed > 0 ? (
                <span>
                  {d.actionBar.toCall}{' '}
                  <span className="text-base font-black tabular-nums text-warn">
                    {formatChips(callAmount, locale)}
                  </span>
                </span>
              ) : lastBet === 0 ? (
                <span>{d.actionBar.beforeFirstBet}</span>
              ) : (
                <span>{d.actionBar.waitingForCall}</span>
              )}
            </div>
            {gateReason ? (
              <p className="text-center text-sm font-medium text-muted">{gateReason}</p>
            ) : null}
            {raiseOpen && round && !gateReason ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>{d.actionBar.raiseAmount}</span>
                  <span>{format(d.actionBar.minRaise, { n: formatChips(minRaise, locale) })}</span>
                </div>
                {/* 프리셋 그리드 간격은 member-sheet-buy-in의 같은 패턴과 gap-2로 맞춘다 */}
                <div
                  className={
                    presets.length > 4 ? 'grid grid-cols-5 gap-2' : 'grid grid-cols-4 gap-2'
                  }
                >
                  {presets.map((preset) => (
                    <Button
                      key={preset.label}
                      type="button"
                      selected={raiseAmount === preset.amount}
                      className={STACK_BUTTON_CLASS}
                      disabled={preset.amount > balance}
                      disabledReason={
                        preset.amount > balance ? d.actionBar.insufficientBalance : undefined
                      }
                      onClick={() => setRaiseAmount(preset.amount)}
                    >
                      {preset.label}
                      <span className={STACK_AMOUNT_CLASS}>
                        {formatChips(preset.amount, locale)}
                      </span>
                    </Button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Stepper
                    value={raiseAmount}
                    onChange={setRaiseAmount}
                    min={0}
                    max={balance}
                    step={base}
                    ariaLabel={d.actionBar.raiseAmount}
                    decreaseLabel={d.ui.decrease}
                    increaseLabel={d.ui.increase}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="lg"
                    loading={firingSlot === 'raise'}
                    loadingLabel={d.ui.processing}
                    /*
                      잔액 전부(= 올인)는 최소 레이즈 하한을 적용받지 않는다 — 아래 onClick이
                      'raise'가 아니라 'allin'을 쏘고, 서버 규칙(`bet-amount-rule.ts`)도 올인은
                      `amount === balance`만 본다. 예전 조건은 `raiseAmount < minRaise`를 무조건
                      막아서, 삥보다 잔액이 적은 사람이 판을 여는 올인을 아예 못 눌렀다.
                    */
                    disabled={
                      isPending ||
                      raiseAmount < 1 ||
                      raiseAmount > balance ||
                      (raiseAmount < minRaise && raiseAmount !== balance)
                    }
                    disabledReason={
                      raiseAmount > balance
                        ? d.actionBar.insufficientBalance
                        : raiseAmount < minRaise && raiseAmount !== balance
                          ? format(d.actionBar.minRaise, { n: formatChips(minRaise, locale) })
                          : undefined
                    }
                    onClick={() =>
                      fire(raiseAmount >= balance ? 'allin' : 'raise', raiseAmount, 'raise')
                    }
                  >
                    {format(d.actionBar.confirmAction, {
                      label: raiseAmount >= balance ? labels.allin : labels.raise,
                    })}
                  </Button>
                </div>
              </div>
            ) : null}

            {/*
              콜·레이즈·다이 3열. 셋 다 사이즈 계약의 lg(min-h-14·text-lg)를 그대로 쓰고 가로
              패딩만 GRID_BUTTON_CLASS로 동일하게 좁힌다 — 높이·패딩·글자 크기가 셋 다 같아야
              한다. whitespace-nowrap과 text-lg는 Button의 base/lg가 이미 주므로 다시 쓰지 않는다.
            */}
            <div className="grid grid-cols-3 gap-2">
              {canCheck ? (
                <Button
                  type="button"
                  variant="win"
                  size="lg"
                  className={GRID_BUTTON_CLASS}
                  loading={firingSlot === 'call'}
                  loadingLabel={d.ui.processing}
                  disabled={disabled}
                  disabledReason={reason}
                  onClick={() => fire('check', 0, 'call')}
                >
                  {labels.check}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="win"
                  size="lg"
                  className={STACK_BUTTON_CLASS}
                  loading={firingSlot === 'call'}
                  loadingLabel={d.ui.processing}
                  // 이 가지는 `canCheck === false`(= 맞출 금액이 남았다)일 때만 그려지므로
                  // callAmount는 항상 1 이상이다. 남은 게이트는 "잔액이 콜에 못 미친다" 하나뿐.
                  disabled={disabled || cannotCoverCallReason !== null}
                  disabledReason={reason ?? cannotCoverCallReason ?? undefined}
                  onClick={() => fire(callIsAllin ? 'allin' : 'call', callAmount, 'call')}
                >
                  {callIsAllin ? labels.allin : labels.call}
                  <span className={STACK_AMOUNT_CLASS}>{formatChips(callAmount, locale)}</span>
                </Button>
              )}
              <Button
                type="button"
                variant="primary"
                size="lg"
                className={GRID_BUTTON_CLASS}
                disabled={disabled || balance < 1}
                disabledReason={
                  reason ?? (balance < 1 ? d.actionBar.insufficientBalance : undefined)
                }
                onClick={() => {
                  if (!raiseOpen) {
                    const firstValid = presets.find((preset) => preset.amount <= balance)
                    setRaiseAmount(firstValid?.amount ?? minRaiseRounded)
                  }
                  setRaiseOpen((open) => !open)
                }}
              >
                {labels.raise}
              </Button>
              <Button
                type="button"
                variant="danger"
                size="lg"
                className={GRID_BUTTON_CLASS}
                loading={firingSlot === 'fold'}
                loadingLabel={d.ui.processing}
                disabled={disabled}
                disabledReason={reason}
                onClick={() => fire('fold', 0, 'fold')}
              >
                {labels.fold}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
