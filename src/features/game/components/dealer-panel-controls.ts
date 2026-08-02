'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useDict } from '@/lib/i18n/client'
import { computeRoundCompletion } from '@/features/betting/round-completion'
import { closeRoom } from '../actions'
import { endRound, startRound, voidRound } from '../round-actions'
import type { RoomSnapshot } from '../types'
import { betLabelsFor, nonFoldedParticipantIds, type RunAction, type VoidReason } from './shared'
import {
  gostopEffectiveScore,
  gostopLoserPenalties,
  initialGostopScore,
  type GostopScoreState,
} from './gostop-score-form'

export type DealerPanelMode = 'idle' | 'pickWinner'
export type DealerSlot = 'start' | 'end' | 'void' | 'settle' | 'confirmWinner'

/**
 * 딜러 컨트롤(판 시작/종료/무효/정산/승자 확정)의 상태·서버 액션 로직을 데스크톱
 * `DealerPanel`(Panel 안 인라인)과 모바일 `DealerQuickBar`+`DealerToolsSheet`(하단 바 +
 * 시트)가 공유한다. 두 표면 모두 같은 판정 규칙을 쓰도록 로직은 여기 한 곳에만 둔다.
 */
export function useDealerPanelControls({
  snapshot,
  selfId,
  runAction,
}: {
  snapshot: RoomSnapshot
  selfId: string
  runAction: RunAction
}) {
  const { d } = useDict()
  const [mode, setMode] = useState<DealerPanelMode>('idle')
  const [winnerId, setWinnerId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [gostop, setGostop] = useState<GostopScoreState>(initialGostopScore)
  const [settleOpen, setSettleOpen] = useState(false)
  const [voidTarget, setVoidTarget] = useState<'current' | 'last' | null>(null)
  const [voidReason, setVoidReason] = useState<VoidReason>('재경기')
  const [isPending, startTransition] = useTransition()
  const [firingSlot, setFiringSlot] = useState<DealerSlot | null>(null)

  const roomId = snapshot.room.id
  const round = snapshot.currentRound
  const isHost = snapshot.members.find((member) => member.userId === selfId)?.role === 'host'
  const players = snapshot.members.filter((member) => member.role !== 'observer')
  const isGostop = snapshot.room.gameType === 'gostop'
  const verifiedFairness = snapshot.room.gameType === 'seotda' ? (round?.fairness ?? null) : null
  const verifiedDealReady = verifiedFairness?.phase === 'sealed'

  const eligibleWinnerIds = new Set(
    nonFoldedParticipantIds(
      players.map((member) => member.userId),
      snapshot.actions,
    ),
  )
  const eligiblePlayers = players.filter((member) => eligibleWinnerIds.has(member.userId))
  const foldWinWinner = !isGostop && eligiblePlayers.length === 1 ? eligiblePlayers[0]! : null
  const selectedWinnerIsEligible = winnerId !== null && eligibleWinnerIds.has(winnerId)
  const gostopLosers =
    isGostop && winnerId ? players.filter((member) => member.userId !== winnerId) : []
  const betLabels = betLabelsFor(snapshot.room.gameType, d)
  const noteExample =
    snapshot.room.gameType === 'seotda'
      ? d.dealer.noteExampleSeotda
      : isGostop
        ? d.dealer.noteExampleGostop
        : d.dealer.noteExamplePoker

  const run = (slot: DealerSlot, task: () => Promise<unknown>) => {
    if (isPending) return
    setFiringSlot(slot)
    startTransition(async () => {
      try {
        await task()
      } finally {
        setFiringSlot(null)
      }
    })
  }

  const nameOf = (userId: string) =>
    snapshot.members.find((member) => member.userId === userId)?.displayName ?? '?'

  const openVoidDialog = (target: 'current' | 'last') => {
    setVoidReason('재경기')
    setVoidTarget(target)
  }

  const confirmVoid = () => {
    const reason = voidReason
    // 다이얼로그가 "N번째 판을 무효화한다"고 말한 바로 그 판을 같이 보낸다. 안 보내면
    // 서버가 대상을 혼자 다시 고르는데, 그 사이 다른 딜러가 새 판을 시작했으면
    // "지난 판 취소"가 방금 시작한 판을 지운다.
    const targetRoundId =
      voidTarget === 'current' ? snapshot.currentRound?.id : snapshot.lastResult?.roundId
    setVoidTarget(null)
    run('void', () =>
      runAction(
        () => voidRound({ roomId, reason, ...(targetRoundId ? { roundId: targetRoundId } : {}) }),
        (data) => ({
          event: 'round.voided',
          payload: { roundId: data.roundId, seq: data.seq, reason },
        }),
      ),
    )
  }

  const finishVerifiedRound = () => {
    if (!round || !verifiedDealReady) return
    run('end', () =>
      runAction(
        () => endRound({ roomId }),
        (data) => ({
          event: 'round.ended',
          payload: {
            roundId: round.id,
            seq: data.seq,
            winnerId: data.winnerId,
            pot: data.pot,
          },
        }),
      ),
    )
  }

  const startRoundNow = () => {
    run('start', () =>
      runAction(
        () => startRound(roomId),
        (data) => ({
          event: 'round.started',
          payload: { roundId: data.roundId, seq: data.seq },
        }),
      ),
    )
  }

  const beginEndRound = () => {
    if (!round) return
    if (verifiedFairness) {
      finishVerifiedRoundRef.current()
      return
    }
    setWinnerId(foldWinWinner?.userId ?? null)
    setNote('')
    setGostop((current) => ({ ...initialGostopScore, base: current.base }))
    setMode('pickWinner')
  }

  const cancelPickWinner = () => setMode('idle')

  // 판 자동 종료(`round-completion.ts`) — 콜이 다 맞아 쇼다운 단계가 되면 딜러가 "🏁 종료"를
  // 누르지 않아도 되게 한다. 1인 생존 케이스는 서버(`autoSettleRoundIfComplete`)가 완전
  // 자동으로 끝내므로 여기서는 손댈 게 없다(그 시점엔 이미 `round`가 null이 된다). 2인 이상
  // 남아 콜만 맞춰진 쇼다운 단계는 카드 판정이 필요해서 서버가 승자를 못 정하므로:
  // - 검증 딜(공정 딜)이 봉인까지 끝났으면 카드로 자동 판정 가능 — 딜러가 수동으로 누르던
  //   `finishVerifiedRound()`를 그대로 자동 호출한다(새 판정 로직 아님, 기존 버튼 핸들러 재사용).
  // - 아니면 승자 확정 폼(`pickWinner`)을 자동으로 연다 — 카드는 딜러가 직접 봐야 한다.
  // 라운드당 한 번만 시도한다(ref) — 안 그러면 딜러가 폼을 취소해도 재렌더마다 다시 열린다.
  const autoTriggeredForRound = useRef<string | null>(null)
  // 핸들러를 deps에 직접 넣으면 매 렌더마다 새 클로저라 effect가 매번 다시 돈다.
  // use-room-sync.ts의 onEventRef와 같은 방식으로 최신 참조만 들고 있는다.
  const finishVerifiedRoundRef = useRef(finishVerifiedRound)
  finishVerifiedRoundRef.current = finishVerifiedRound
  useEffect(() => {
    if (!round) {
      autoTriggeredForRound.current = null
      return
    }
    if (mode !== 'idle' || isPending) return
    if (autoTriggeredForRound.current === round.id) return

    const participantIds = players.map((member) => member.userId)
    const completion = computeRoundCompletion(participantIds, snapshot.actions)
    if (completion.kind !== 'showdown_ready') return

    if (verifiedFairness) {
      if (!verifiedDealReady) return
      autoTriggeredForRound.current = round.id
      finishVerifiedRoundRef.current()
      return
    }

    autoTriggeredForRound.current = round.id
    setWinnerId(foldWinWinner?.userId ?? null)
    setNote('')
    setGostop((current) => ({ ...initialGostopScore, base: current.base }))
    setMode('pickWinner')
  }, [
    round,
    mode,
    isPending,
    players,
    snapshot.actions,
    verifiedFairness,
    verifiedDealReady,
    foldWinWinner,
  ])

  const confirmWinnerNow = () => {
    if (!round || !winnerId || !eligibleWinnerIds.has(winnerId)) return
    const roundId = round.id
    const penalties = gostopLoserPenalties(
      gostop,
      gostopLosers.map((member) => member.userId),
    )
    run('confirmWinner', async () => {
      const success = await runAction(
        () =>
          endRound({
            roomId,
            winnerId,
            note: note.trim() || undefined,
            score: isGostop ? gostopEffectiveScore(gostop) : undefined,
            loserPenalties: isGostop && penalties.length > 0 ? penalties : undefined,
          }),
        (data) => ({
          event: 'round.ended',
          payload: { roundId, seq: data.seq, winnerId: data.winnerId, pot: data.pot },
        }),
      )
      if (success) setMode('idle')
    })
  }

  const confirmSettle = () => {
    setSettleOpen(false)
    run('settle', () => runAction(() => closeRoom(roomId)))
  }

  return {
    mode,
    winnerId,
    setWinnerId,
    note,
    setNote,
    gostop,
    setGostop,
    settleOpen,
    setSettleOpen,
    voidTarget,
    setVoidTarget,
    voidReason,
    setVoidReason,
    isPending,
    firingSlot,
    round,
    isHost,
    isGostop,
    verifiedFairness,
    verifiedDealReady,
    eligiblePlayers,
    foldWinWinner,
    selectedWinnerIsEligible,
    gostopLosers,
    betLabels,
    noteExample,
    nameOf,
    openVoidDialog,
    confirmVoid,
    finishVerifiedRound,
    startRoundNow,
    beginEndRound,
    cancelPickWinner,
    confirmWinnerNow,
    confirmSettle,
  }
}
