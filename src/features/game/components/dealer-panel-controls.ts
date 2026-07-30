'use client'

import { useState, useTransition } from 'react'
import { useDict } from '@/lib/i18n/client'
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
    setVoidTarget(null)
    run('void', () =>
      runAction(
        () => voidRound({ roomId, reason }),
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
      finishVerifiedRound()
      return
    }
    setWinnerId(foldWinWinner?.userId ?? null)
    setNote('')
    setGostop((current) => ({ ...initialGostopScore, base: current.base }))
    setMode('pickWinner')
  }

  const cancelPickWinner = () => setMode('idle')

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
