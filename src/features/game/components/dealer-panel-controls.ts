'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useDict } from '@/lib/i18n/client'
import { computeRoundCompletion } from '@/features/betting/round-completion'
import { closeRoom } from '../actions'
import { endRound, startRound, voidRound } from '../round-actions'
import type { RoomSnapshot } from '../types'
import {
  betLabelsFor,
  nonFoldedParticipantIds,
  voidTargetRoundId,
  type RunAction,
  type VoidReason,
  type VoidTarget,
} from './shared'
import {
  gostopEffectiveScore,
  gostopLoserPenalties,
  initialGostopScore,
  type GostopScoreState,
} from './gostop-score-form'

export type DealerPanelMode = 'idle' | 'pickWinner'
export type DealerSlot = 'start' | 'end' | 'void' | 'settle' | 'confirmWinner'

/**
 * 검증 딜 방에서 승부가 안 났을 때 `endRound`가 돌려주는 키
 * (`round-fairness-ops.ts`의 `FairRoundWinnerResolution`). 화면이 이 하나만 다르게 다룬다 —
 * 실패했으니 토스트를 띄우고 끝, 이 아니라 "다음에 뭘 눌러야 하는지"를 보여줘야 한다.
 */
const REPLAY_REQUIRED_ERROR = 'errors.fairnessReplayRequired'

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
  const [voidTarget, setVoidTarget] = useState<VoidTarget | null>(null)
  const [voidReason, setVoidReason] = useState<VoidReason>('재경기')
  const [isPending, startTransition] = useTransition()
  const [firingSlot, setFiringSlot] = useState<DealerSlot | null>(null)

  const roomId = snapshot.room.id
  const round = snapshot.currentRound
  const isHost = snapshot.members.find((member) => member.userId === selfId)?.role === 'host'
  const seatedMembers = snapshot.members.filter((member) => member.role !== 'observer')
  // 판이 돌고 있으면 서버가 확정한 참가자 목록으로 좁힌다. `members`에서 관전자만 걸러 쓰면
  // 판 도중 입장한 사람이 승자 후보와 완료 판정에 끼어, `computeRoundCompletion`이 계속
  // `active`를 돌려줘 승자 확정 폼이 자동으로 열리지 않고 서버가 거부할 사람이 후보로 뜬다.
  const roundParticipantIds = round?.participantUserIds ?? null
  const players = roundParticipantIds
    ? seatedMembers.filter((member) => roundParticipantIds.includes(member.userId))
    : seatedMembers
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

  const openVoidDialog = (target: VoidTarget) => {
    setVoidReason('재경기')
    setVoidTarget(target)
  }

  const confirmVoid = () => {
    const reason = voidReason
    // 다이얼로그가 "N번째 판을 무효화한다"고 말한 바로 그 판을 같이 보낸다. 안 보내면
    // 서버가 대상을 혼자 다시 고르는데, 그 사이 다른 딜러가 새 판을 시작했으면
    // "지난 판 취소"가 방금 시작한 판을 지운다.
    // `replay`(구사·무승부·나가리)는 대상이 `current`와 같은 진행 중인 판이다.
    const targetRoundId = voidTargetRoundId(voidTarget, {
      current: snapshot.currentRound?.id,
      last: snapshot.lastResult?.roundId,
    })
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
        async () => {
          const result = await endRound({ roomId })
          // 검증 딜 방에서 구사·무승부가 나면 서버가 승자를 정할 수 없어 판이 그대로 멈춘다.
          // 이 경로는 쇼다운이 되면 딜러가 누르지 않아도 자동으로 한 번 도는데(아래 effect),
          // 그때 뜨는 토스트 한 줄을 놓치면 아무도 다음에 뭘 눌러야 하는지 모른 채 판이 잠긴다.
          // 그래서 무효화(재경기) 확인 다이얼로그를 바로 띄운다 — 데스크톱 패널과 모바일
          // 퀵바가 같은 `voidTarget` 상태로 같은 다이얼로그를 그리므로 두 화면 모두 뜬다.
          if (!result.success && result.error === REPLAY_REQUIRED_ERROR) {
            setVoidReason('재경기')
            setVoidTarget('replay')
          }
          return result
        },
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
      // 판이 사라졌는데 승자 확정 폼이 열려 있으면 딜러 화면이 통째로 비어 버린다 —
      // 패널은 `mode === 'idle'`일 때만 버튼 그리드를, `mode === 'pickWinner' && round`일 때만
      // 폼을 그리므로 둘 다 거짓인 상태가 된다. 판이 다른 경로로 끝났을 때(자동 종료·다른
      // 딜러의 종료·무효화) 실제로 그렇게 된다.
      if (mode !== 'idle') setMode('idle')
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
