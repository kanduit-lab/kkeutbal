import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import type { Dictionary } from '@/lib/i18n/client'
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
import { nextActorId } from '../turn-order'
import { buildRaisePresetOptions } from './action-bar-presets'
import { computeActionGateReason } from './action-bar-gate'
import { lastAcceptedByUser, type RunAction } from './shared'

export type ActionSlot = 'call' | 'raise' | 'fold'

interface UseActionBarControlsParams {
  snapshot: RoomSnapshot
  self: MemberView
  runAction: RunAction
  staleReason: string | null
  inline: boolean
  gameType: 'seotda' | 'poker'
  labels: Record<BetActionKind, string>
  d: Dictionary
  toast: (message: string, tone?: 'info' | 'error' | 'success') => void
}

/**
 * `ActionBar`의 상태·계산·서버 액션 배선을 담는 훅. JSX(action-bar.tsx)에서 그대로 옮겨왔고,
 * 훅 호출 순서는 원래 컴포넌트에 있던 순서를 한 글자도 바꾸지 않았다 — 원래도 조건부 훅 호출이
 * 없었으므로(단일 return 앞에 모든 훅이 무조건 호출됨), 이 훅 함수 하나로 옮겨도 매 렌더
 * 플랫튼된 훅 호출 순서는 동일하다.
 *
 * 게이트 문구·프리셋 금액 계산은 순수 함수(`action-bar-gate.ts`, `action-bar-presets.ts`)로
 * 뽑아서 훅은 그 함수들을 호출하는 배선만 담당한다.
 */
export function useActionBarControls({
  snapshot,
  self,
  runAction,
  staleReason,
  inline,
  gameType,
  labels,
  d,
  toast,
}: UseActionBarControlsParams) {
  const [raiseOpen, setRaiseOpen] = useState(false)
  const [raiseAmount, setRaiseAmount] = useState(0)
  const [isPending, startTransition] = useTransition()

  const [firingSlot, setFiringSlot] = useState<ActionSlot | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)

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

  const intentRef = useRef<{ id: string; action: BetActionKind; amount: number } | null>(null)

  const round = snapshot.currentRound
  const noRoundReason = round ? null : d.actionBar.noRound
  const balance = self.balance
  const pot = round?.pot ?? 0

  const myLastAccepted = useMemo(
    () => lastAcceptedByUser(snapshot.actions).get(self.userId) ?? null,
    [snapshot.actions, self.userId],
  )

  const hasPendingAction = useMemo(
    () =>
      snapshot.actions.some(
        (action) => action.status === 'pending' && action.userId === self.userId,
      ),
    [snapshot.actions, self.userId],
  )

  // 서버가 실제로 강제하는 턴 검증과 같은 순수 함수(`../turn-order`)로 클라이언트에서도 미리
  // 막는다 — 서버 왕복 없이 바로 "왜 안 되는지"를 보여주기 위함이다. 최종 방어선은 서버
  // (`betting/actions.ts`의 `errors.notYourTurn`)이지 이 UI가 아니다.
  const participantIds = useMemo(
    () => snapshot.members.filter((m) => m.role !== 'observer').map((m) => m.userId),
    [snapshot.members],
  )
  const currentActorId = useMemo(
    () => (round ? nextActorId(participantIds, snapshot.actions) : null),
    [round, participantIds, snapshot.actions],
  )
  // currentActorId가 null이면(한 바퀴 완료·참가자 없음 등) 판단을 서버에 맡기고 UI는 막지 않는다.
  const isMyTurn = currentActorId === null || currentActorId === self.userId
  const currentActorName = currentActorId
    ? (snapshot.members.find((m) => m.userId === currentActorId)?.displayName ?? null)
    : null

  const gateReason = computeActionGateReason(
    {
      lastAcceptedAction: myLastAccepted?.action ?? null,
      hasPendingAction,
      isMyTurn,
      currentActorName,
      staleReason,
    },
    {
      foldedGate: d.actionBar.foldedGate,
      allinGate: d.actionBar.allinGate,
      pendingGate: d.actionBar.pendingGate,
      notYourTurn: d.actionBar.notYourTurn,
    },
  )

  const betting = useMemo(() => roundBetState(snapshot.actions), [snapshot.actions])
  const contribution = contributedBy(betting, self.userId)
  const lastBet = betting.currentToCall
  const needed = neededToCall(betting, self.userId)

  const base = snapshot.room.baseBet
  const canCheck = needed === 0

  const callAmount = Math.min(needed, balance)
  const callIsAllin = needed > 0 && balance <= needed
  const minRaise = minimumRaiseAmount(betting, self.userId, base)

  const minRaiseRounded = base > 0 ? Math.ceil(minRaise / base) * base : minRaise
  const presets = useMemo(
    () =>
      buildRaisePresetOptions(
        gameType,
        { lastBet, pot, base, contribution, minRaise, balance },
        labels.allin,
        d.presets,
      ),
    [gameType, lastBet, pot, base, balance, labels.allin, minRaise, contribution, d.presets],
  )

  function fire(action: BetActionKind, amount: number, slot: ActionSlot) {
    if (!round || isPending || gateReason) return

    const previous = intentRef.current
    const intent =
      previous && previous.action === action && previous.amount === amount
        ? previous
        : { id: crypto.randomUUID(), action, amount }
    intentRef.current = intent
    setFiringSlot(slot)

    const runIntent = async () => {
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
          (data) =>
            // 이 베팅으로 판이 자동 종료됐으면(1인 생존·콜 완료 — docs/12-handoff.md 9번) 다른
            // 참가자에게는 개별 bet.placed보다 round.ended가 더 중요한 신호다. 한 액션에 한
            // 이벤트만 보낼 수 있어(runAction 계약) 자동 종료 쪽을 우선한다 — bet.placed로 알릴
            // 내용(이 베팅 자체)은 곧이어 오는 state.snapshot과 round.ended 수신 시의 refetch로
            // 이미 반영된다.
            data.roundEnded
              ? {
                  event: 'round.ended',
                  payload: {
                    roundId: data.action.roundId,
                    seq: data.roundEnded.seq,
                    winnerId: data.roundEnded.winnerId,
                    pot: data.roundEnded.pot,
                  },
                }
              : {
                  event: 'bet.placed',
                  payload: {
                    actionId: data.action.id,
                    roundId: data.action.roundId,
                    action: data.action.action,
                    amount: data.action.amount,
                    seq: data.action.seq,
                  },
                },
        )
      } catch (error) {
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
        intentRef.current = null
        return
      }

      let landed = false
      try {
        await runAction(
          () => refreshRoom(snapshot.room.id),
          (data) => {
            landed = data.actions.some((entry) => entry.id === intent.id)
          },
        )
      } catch (error) {
        console.error('refreshRoom request failed:', error)
      }
      if (!landed) return
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

  const disabled = !round || isPending || gateReason !== null
  const reason = noRoundReason ?? gateReason ?? undefined

  return {
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
    disabled,
    reason,
    fire,
  }
}
