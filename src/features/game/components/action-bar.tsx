'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { placeBet } from '@/features/betting/actions'
import {
  contributedBy,
  minimumRaiseAmount,
  neededToCall,
  roundBetState,
} from '@/features/betting/round-bet-state'
import { playChip, playFold } from '@/lib/sound'
import { refreshRoom } from '../actions'
import type { BetActionKind, MemberView, RoomSnapshot } from '../types'
import { Button, Stepper, useToast } from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'
import {
  betLabelsFor,
  formatChips,
  lastAcceptedByUser,
  raisePresets,
  type RunAction,
} from './shared'

/**
 * 하단 고정 베팅 바 — 표준 베팅 규칙, 키보드 없이 터치만으로 조작한다.
 *
 * - 콜 금액 = 직전 확정 베팅 금액 (자동, 입력 불가). 잔액이 모자라면 올인 콜.
 * - 체크 = 이번 판에 아직 베팅이 없을 때만 — 그때는 콜 자리가 체크가 된다.
 * - 레이즈 = 프리셋(삥/따당/하프/풀) + 스테퍼(± 삥 단위). 최소 레이즈 미만 프리셋은 숨긴다.
 * - 다이·올인을 확정했거나 내 액션이 딜러 승인 대기 중이면 버튼을 잠그고 사유를 보여준다.
 * - actionId 는 베팅 의도(액션+금액) 단위로 한 번만 생성 — 타임아웃 후 재탭이 같은 id 로
 *   재전송돼 서버 멱등키에 흡수된다. 응답이 안 온 경우 refetch 로 반영 여부를 판정한다.
 * - 고스톱 방은 이 컴포넌트를 렌더하지 않는다 (점수 정산)
 */
/** 진행 표시를 붙일 버튼 자리. 세 버튼이 한꺼번에 도는 대신 누른 버튼만 돌게 한다. */
type ActionSlot = 'call' | 'raise' | 'fold'

export function ActionBar({
  snapshot,
  self,
  runAction,
  staleReason = null,
  inline = false,
}: {
  snapshot: RoomSnapshot
  self: MemberView
  runAction: RunAction
  /** 스냅샷이 낡아 조작을 잠글 사유. null 이면 정상. */
  staleReason?: string | null
  /** true = 데스크톱 본문 안 정적 패널, false = 모바일 하단 고정 바 */
  inline?: boolean
}) {
  const { d, locale } = useDict()
  const gameType = snapshot.room.gameType === 'poker' ? 'poker' : 'seotda'
  const labels = betLabelsFor(snapshot.room.gameType, d)
  const { toast } = useToast()
  const [raiseOpen, setRaiseOpen] = useState(false)
  const [raiseAmount, setRaiseAmount] = useState(0)
  const [isPending, startTransition] = useTransition()
  /** 현재 요청이 걸린 버튼 자리 — 스피너를 그 버튼에만 붙인다. */
  const [firingSlot, setFiringSlot] = useState<ActionSlot | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)

  /**
   * 하단 고정 바의 실제 높이를 --action-bar-h 로 내보낸다. 레이즈 패널이 열리면
   * 바는 114px → 최대 274px 까지 자란다 — 본문의 하단 여백을 상수로 잡아 두면
   * 로비·고스톱 화면에는 죽은 여백이, 레이즈 중에는 가려진 내용이 생긴다.
   * inline(데스크톱)일 때는 바가 문서 흐름 안에 있으므로 변수를 지운다.
   */
  useEffect(() => {
    const root = document.documentElement
    if (inline) {
      root.style.removeProperty('--action-bar-h')
      return
    }
    const node = barRef.current
    if (!node) return
    const apply = () => root.style.setProperty('--action-bar-h', `${node.offsetHeight}px`)
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(node)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--action-bar-h')
    }
  }, [inline])
  /**
   * 진행 중 베팅 의도 — 같은 의도의 재시도가 같은 actionId 를 쓰게 붙잡아 둔다.
   * 확정 성공·확정 실패 시 비우고, 타임아웃(결과 불명)에는 유지한다.
   */
  const intentRef = useRef<{ id: string; action: BetActionKind; amount: number } | null>(null)

  const round = snapshot.currentRound
  const noRoundReason = round ? null : d.actionBar.noRound
  const balance = self.balance
  const pot = round?.pot ?? 0

  /** 내 마지막 확정 액션 — 다이·올인이면 이번 판에는 더 행동할 수 없다. */
  const myLastAccepted = useMemo(
    () => lastAcceptedByUser(snapshot.actions).get(self.userId) ?? null,
    [snapshot.actions, self.userId],
  )
  /** 승인 모드에서 내 액션이 딜러 처리 대기 중이면 추가 입력을 막는다. 승인·거절 시 refetch 로 풀린다. */
  const hasPendingAction = useMemo(
    () =>
      snapshot.actions.some(
        (action) => action.status === 'pending' && action.userId === self.userId,
      ),
    [snapshot.actions, self.userId],
  )
  const gateReason =
    myLastAccepted?.action === 'fold'
      ? d.actionBar.foldedGate
      : myLastAccepted?.action === 'allin'
        ? d.actionBar.allinGate
        : hasPendingAction
          ? d.actionBar.pendingGate
          : (staleReason ?? null)

  /** 콜·레이즈는 액션 한 번의 금액이 아니라 사용자별 이번 판 누적 납입액에서 계산한다. */
  const betting = useMemo(() => roundBetState(snapshot.actions), [snapshot.actions])
  const contribution = contributedBy(betting, self.userId)
  const lastBet = betting.currentToCall
  const needed = neededToCall(betting, self.userId)

  const base = snapshot.room.baseBet
  const canCheck = needed === 0
  /** 잔액이 콜 금액보다 적으면 잔액 전부로 콜(올인 콜)한다. */
  const callAmount = Math.min(needed, balance)
  const callIsAllin = needed > 0 && balance <= needed
  const minRaise = minimumRaiseAmount(betting, self.userId, base)
  /** 프리셋이 전부 걸러졌을 때 패널 초기값 — 최소 레이즈를 삥 단위로 올림. */
  const minRaiseRounded = base > 0 ? Math.ceil(minRaise / base) * base : minRaise
  const presets = useMemo(() => {
    // 최소 레이즈 미만 프리셋은 눌러도 거절될 금액이라 아예 보여주지 않는다.
    const standard = raisePresets(gameType, { lastBet, pot, base }, d.presets)
      .filter((preset) => preset.amount > lastBet)
      .map((preset) => ({ ...preset, amount: preset.amount - contribution }))
      .filter((preset) => preset.amount >= minRaise)
    // 올인은 항상 마지막 프리셋 — 잔액 전부. 최소 레이즈 미만이어도 올인은 유효하다.
    return balance > 0 ? [...standard, { label: labels.allin, amount: balance }] : standard
  }, [gameType, lastBet, pot, base, balance, labels.allin, minRaise, contribution, d.presets])

  function fire(action: BetActionKind, amount: number, slot: ActionSlot) {
    // 렌더 게이트와 별개로 한 번 더 막는다 — 연타·이벤트 경합으로 새는 요청 차단.
    if (!round || isPending || gateReason) return
    // 같은 의도(액션+금액)의 재시도는 같은 actionId — 서버가 멱등키로 흡수한다.
    const previous = intentRef.current
    const intent =
      previous && previous.action === action && previous.amount === amount
        ? previous
        : { id: crypto.randomUUID(), action, amount }
    intentRef.current = intent
    setFiringSlot(slot)

    /** 실제 전송·확인 절차. 스피너 해제를 finally 한곳으로 모으려고 분리했다. */
    const runIntent = async () => {
      /**
       * placeBet 의 실제 응답 — null 이면 결과 불명(타임아웃·네트워크 단절).
       * runAction 의 15초 레이스가 버린 늦은 성공 응답도 여기 잡힌다 — 그 경우를
       * 확정 실패로 오판해 intent 를 비우면 재탭이 새 actionId 로 이중 베팅이 된다.
       */
      // 클로저 안 대입은 TS 제어 흐름이 추적하지 못한다 — 객체 프로퍼티로 우회
      const settled: { current: Awaited<ReturnType<typeof placeBet>> | null } = { current: null }
      let success = false
      try {
        success = await runAction(
          () =>
            placeBet({
              actionId: intent.id,
              roomId: snapshot.room.id,
              action,
              amount,
            }).then((result) => {
              settled.current = result
              return result
            }),
          (data) => ({
            event: 'bet.placed',
            payload: {
              actionId: data.action.id,
              roundId: data.action.roundId,
              action: data.action.action,
              amount: data.action.amount,
              seq: data.action.seq,
            },
          }),
        )
      } catch (error) {
        // 네트워크 단절로 요청 자체가 거부돼도 서버에는 닿았을 수 있다 — 타임아웃과 같게 다룬다.
        console.error('placeBet request failed:', error)
        toast(d.actionBar.networkRetry, 'error')
      }
      if (success) {
        intentRef.current = null
        if (action === 'fold') playFold()
        else if (amount > 0) playChip()
        setRaiseOpen(false)
        return
      }
      if (settled.current !== null && !settled.current.success) {
        // 서버가 확정 거절(잔액 부족 등) — 다음 탭은 새 의도로 시작한다.
        intentRef.current = null
        return
      }
      // 결과 불명 또는 늦은 성공 — 서버에 이미 반영됐을 수 있다. 스냅샷의 actionId 존재로 판정한다.
      let landed = false
      try {
        await runAction(
          () => refreshRoom(snapshot.room.id),
          (data) => {
            landed = data.actions.some((entry) => entry.id === intent.id)
          },
        )
      } catch (error) {
        // 확인 refetch 까지 실패 — intent 를 유지해 재탭이 같은 actionId 로 재전송되게 둔다.
        console.error('refreshRoom request failed:', error)
      }
      if (!landed) return // 미반영 — intent 유지, 재탭이 같은 actionId 로 재전송된다
      intentRef.current = null
      toast(d.actionBar.alreadyApplied)
      if (action === 'fold') playFold()
      else if (amount > 0) playChip()
      setRaiseOpen(false)
    }

    startTransition(async () => {
      try {
        await runIntent()
      } finally {
        setFiringSlot(null)
      }
    })
  }

  // 진행 중에는 나머지 버튼도 잠근다 — fire() 가 어차피 요청을 막으므로, 열어 두면
  // 탭이 아무 반응 없이 삼켜진다. 스피너는 누른 버튼 하나만(loading), 나머지는 흐림.
  const disabled = !round || isPending || gateReason !== null
  const reason = noRoundReason ?? gateReason ?? undefined

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
            : 'mx-auto w-full max-w-lg space-y-2.5 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3'
        }
      >
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
          ) : (
            <span>{d.actionBar.beforeFirstBet}</span>
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
            <div
              className={
                presets.length > 4 ? 'grid grid-cols-5 gap-1.5' : 'grid grid-cols-4 gap-1.5'
              }
            >
              {presets.map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  size="sm"
                  selected={raiseAmount === preset.amount}
                  className="flex-col gap-0"
                  disabled={preset.amount > balance}
                  disabledReason={
                    preset.amount > balance ? d.actionBar.insufficientBalance : undefined
                  }
                  onClick={() => setRaiseAmount(preset.amount)}
                >
                  {preset.label}
                  <span className="tabular-nums text-[11px] leading-tight opacity-80">
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
                className="px-6"
                loading={firingSlot === 'raise'}
                loadingLabel={d.ui.processing}
                disabled={isPending || raiseAmount < minRaise || raiseAmount > balance}
                disabledReason={
                  raiseAmount < minRaise
                    ? format(d.actionBar.minRaise, { n: formatChips(minRaise, locale) })
                    : raiseAmount > balance
                      ? d.actionBar.insufficientBalance
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

        <div className="grid grid-cols-3 gap-2">
          {canCheck ? (
            <Button
              type="button"
              variant="win"
              size="lg"
              className="whitespace-nowrap px-1 text-lg"
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
              className="flex-col gap-0 whitespace-nowrap px-1"
              loading={firingSlot === 'call'}
              loadingLabel={d.ui.processing}
              disabled={disabled || callAmount < 1}
              disabledReason={reason ?? (callAmount < 1 ? d.actionBar.noBalance : undefined)}
              onClick={() => fire(callIsAllin ? 'allin' : 'call', callAmount, 'call')}
            >
              <span className="text-lg leading-tight">
                {callIsAllin ? labels.allin : labels.call}
              </span>
              <span className="tabular-nums text-xs leading-tight opacity-90">
                {formatChips(callAmount, locale)}
              </span>
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            size="lg"
            className="whitespace-nowrap px-1 text-lg"
            disabled={disabled || balance < 1}
            disabledReason={
              reason ?? (balance < 1 ? d.actionBar.insufficientBalance : undefined)
            }
            onClick={() => {
              if (!raiseOpen) {
                // 열 때 초기값: 잔액 안에서 고를 수 있는 첫 프리셋, 없으면 최소 레이즈(삥 단위 올림).
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
            className="whitespace-nowrap px-1 text-lg"
            loading={firingSlot === 'fold'}
            loadingLabel={d.ui.processing}
            disabled={disabled}
            disabledReason={reason}
            onClick={() => fire('fold', 0, 'fold')}
          >
            {labels.fold}
          </Button>
        </div>
      </div>
    </div>
  )
}
