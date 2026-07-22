'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createRoomChannel, onRoomEvent, sendRoomEvent } from '@/lib/realtime/client'
import { refreshRoom } from '../actions'
import type { RoomSnapshot } from '../types'
import { Badge, useToast } from '@/components/ui'
import { ParticipantGrid } from './participant-grid'
import { ActionBar } from './action-bar'
import { DealerPanel } from './dealer-panel'
import { RoundLog } from './round-log'
import { GAME_LABELS, type BroadcastSpec, type RunAction } from './shared'

/**
 * 방 실시간 오케스트레이터.
 *
 * 진실은 서버 스냅샷이다. 실시간 이벤트는 "지금 다시 읽어라" 힌트 + 즉시 표시 값일 뿐이다.
 * 행동한 클라이언트가 Server Action 성공 후 직접 브로드캐스트한다.
 */
export function RoomClient({
  initial,
  selfId,
}: {
  initial: RoomSnapshot
  selfId: string
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [snapshot, setSnapshot] = useState<RoomSnapshot>(initial)
  const [online, setOnline] = useState<ReadonlySet<string>>(new Set([selfId]))
  const [connected, setConnected] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot

  const roomId = initial.room.id

  const refetch = useCallback(async () => {
    const result = await refreshRoom(roomId)
    if (result.success) {
      setSnapshot(result.data)
      if (result.data.room.status === 'settled' || result.data.room.status === 'closed') {
        router.push(`/rooms/${result.data.room.code}/result`)
      }
    }
    return result
  }, [roomId, router])

  const debouncedRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current)
    refetchTimer.current = setTimeout(() => {
      void refetch()
    }, 250)
  }, [refetch])

  /** 채널 구독 + Presence. 재연결 시 스냅샷을 다시 당겨 공백을 메운다. */
  useEffect(() => {
    const self = snapshotRef.current.members.find((member) => member.userId === selfId)
    const channel = createRoomChannel(roomId, selfId)
    channelRef.current = channel

    onRoomEvent(channel, (name, _envelope, payload) => {
      if (name === 'bet.rejected') {
        const rejected = payload as { actionId: string; reason: string }
        const mine = snapshotRef.current.actions.find(
          (action) => action.id === rejected.actionId && action.userId === selfId,
        )
        if (mine) toast(`베팅 거절됨: ${rejected.reason}`, 'error')
      }
      if (name === 'round.started') {
        const started = payload as { seq: number }
        toast(`${started.seq}번째 판 시작`, 'info')
      }
      if (name === 'round.ended') {
        const ended = payload as { winnerId: string | null; pot: number }
        const winner = snapshotRef.current.members.find(
          (member) => member.userId === ended.winnerId,
        )
        if (winner) {
          toast(`🏆 ${winner.displayName} 승리 +${ended.pot.toLocaleString()}`, 'success')
        }
      }
      debouncedRefetch()
    })

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      setOnline(new Set(Object.keys(state)))
      debouncedRefetch() // 새 참가자 입장 감지
    })

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setConnected(true)
        void channel.track({ userId: selfId, displayName: self?.displayName ?? '' })
        void refetch() // 구독 직전 공백 복원
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setConnected(false)
      }
    })

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void refetch()
    }, 20_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refetch()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      void channel.unsubscribe()
      channelRef.current = null
    }
  }, [roomId, selfId, debouncedRefetch, refetch, toast])

  const afterMutation = useCallback(
    async (broadcast?: BroadcastSpec) => {
      const result = await refetch()
      const channel = channelRef.current
      if (!channel) return
      if (broadcast) {
        sendRoomEvent(channel, roomId, selfId, broadcast.event, broadcast.payload)
      }
      if (result.success) {
        sendRoomEvent(channel, roomId, selfId, 'state.snapshot', {
          roomStatus: result.data.room.status,
          currentRound: result.data.currentRound
            ? {
                roundId: result.data.currentRound.id,
                seq: result.data.currentRound.seq,
                pot: result.data.currentRound.pot,
              }
            : null,
          balances: result.data.members.map((member) => ({
            userId: member.userId,
            balance: Math.max(0, member.balance),
          })),
        })
      }
    },
    [refetch, roomId, selfId],
  )

  const runAction: RunAction = useCallback(
    async (run, onSuccess) => {
      const result = await run()
      if (!result.success) {
        toast(result.error, 'error')
        return false
      }
      const broadcast = onSuccess?.(result.data)
      await afterMutation(broadcast ?? undefined)
      return true
    },
    [afterMutation, toast],
  )

  const self = useMemo(
    () => snapshot.members.find((member) => member.userId === selfId) ?? null,
    [snapshot.members, selfId],
  )
  const isDealer = self?.role === 'host' || self?.role === 'dealer'
  const pendingActions = useMemo(
    () => snapshot.actions.filter((action) => action.status === 'pending'),
    [snapshot.actions],
  )

  const canBet = Boolean(self && self.role !== 'observer')

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-48 pt-5 lg:px-8 lg:pb-12 lg:pt-8">
      <header className="rise-in mb-5 flex items-center justify-between lg:mb-8">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-xl text-muted transition-colors hover:text-text">
            ←
          </Link>
          <div>
            <h1 className="font-brush text-xl font-bold leading-tight lg:text-3xl">
              {snapshot.room.name}
            </h1>
            <p className="mt-0.5 text-xs text-muted lg:text-sm">
              코드 <span className="font-mono font-bold tracking-widest">{snapshot.room.code}</span>
              {' · '}
              {GAME_LABELS[snapshot.room.gameType].name}
              {' · '}
              {snapshot.room.inputMode === 'trust' ? '신뢰' : '승인'} 모드
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {!connected ? <Badge tone="warn">연결 끊김</Badge> : null}
          <Badge tone={snapshot.currentRound ? 'win' : 'muted'}>
            {snapshot.currentRound ? `${snapshot.currentRound.seq}판 진행 중` : '대기'}
          </Badge>
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-12 lg:gap-6">
        <div className="lg:col-span-7 xl:col-span-8">
          <section className="lacquer rise-in rise-in-1 mb-4 rounded-2xl px-4 py-5 text-center lg:py-8">
            <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted">현재 팟</p>
            <p className="gilt font-brush text-6xl font-black tabular-nums lg:text-7xl">
              {(snapshot.currentRound?.pot ?? 0).toLocaleString()}
            </p>
            {snapshot.lastResult && !snapshot.currentRound ? (
              <p className="mt-2 text-xs text-muted lg:text-sm">
                지난 {snapshot.lastResult.seq}판:{' '}
                {snapshot.members.find((m) => m.userId === snapshot.lastResult?.winnerId)
                  ?.displayName ?? '무효'}{' '}
                +{snapshot.lastResult.pot.toLocaleString()}
                {snapshot.lastResult.note ? ` · ${snapshot.lastResult.note}` : ''}
              </p>
            ) : null}
          </section>

          <div className="rise-in rise-in-2">
            <ParticipantGrid
              members={snapshot.members}
              online={online}
              selfId={selfId}
              winnerId={snapshot.currentRound ? null : (snapshot.lastResult?.winnerId ?? null)}
            />
          </div>

          {canBet && self ? (
            <div className="rise-in rise-in-3 hidden lg:block">
              <ActionBar snapshot={snapshot} self={self} runAction={runAction} inline />
            </div>
          ) : null}
        </div>

        <div className="lg:col-span-5 xl:col-span-4">
          {isDealer ? (
            <div className="rise-in rise-in-2">
              <DealerPanel
                snapshot={snapshot}
                pendingActions={pendingActions}
                selfId={selfId}
                runAction={runAction}
              />
            </div>
          ) : null}

          <div className="rise-in rise-in-3">
            <RoundLog actions={snapshot.actions} members={snapshot.members} />
          </div>
        </div>
      </div>

      {canBet && self ? (
        <div className="lg:hidden">
          <ActionBar snapshot={snapshot} self={self} runAction={runAction} />
        </div>
      ) : null}
    </main>
  )
}
