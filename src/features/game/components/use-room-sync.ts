'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createRoomChannel, onRoomEvent } from '@/lib/realtime/client'
import type { EventName } from '@/lib/realtime/events'
import { refreshRoom } from '../actions'
import type { RoomSnapshot } from '../types'
import type { ActionResult } from '@/lib/action-result'

/**
 * 방 실시간 동기화 훅 — 채널 구독·Presence·폴링·재접속을 소유한다.
 *
 * 진실은 서버 스냅샷이다. 실시간 이벤트는 "지금 다시 읽어라" 힌트 + 즉시 표시 값일 뿐이다.
 * RoomClient(조작)와 MonitorClient(읽기 전용)가 공유한다.
 */
export function useRoomSync({
  initial,
  selfId,
  onEvent,
}: {
  initial: RoomSnapshot
  selfId: string
  /** 검증 통과한 수신 이벤트 훅 — 사운드·토스트 등 표시용. 상태 반영은 refetch 가 한다. */
  onEvent?: (name: EventName, payload: unknown, current: RoomSnapshot) => void
}) {
  const router = useRouter()
  const [snapshot, setSnapshot] = useState<RoomSnapshot>(initial)
  const [online, setOnline] = useState<ReadonlySet<string>>(new Set([selfId]))
  const [connected, setConnected] = useState(false)
  /** 최초 구독 완료 전에는 "연결 끊김"을 띄우지 않는다 — 접속 초기 오탐 방지. */
  const [everConnected, setEverConnected] = useState(false)
  /** 증가하면 채널을 처음부터 다시 구독한다 — 수동 재접속. */
  const [epoch, setEpoch] = useState(0)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  const roomId = initial.room.id

  const refetch = useCallback(async (): Promise<ActionResult<RoomSnapshot>> => {
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
      onEventRef.current?.(name, payload, snapshotRef.current)
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
        setEverConnected(true)
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
  }, [roomId, selfId, debouncedRefetch, refetch, epoch])

  /** 수동 재접속 — 채널을 새로 만들고 스냅샷을 다시 당긴다. */
  const reconnect = useCallback(() => {
    setEpoch((current) => current + 1)
  }, [])

  return { snapshot, online, connected, everConnected, refetch, reconnect, channelRef }
}
