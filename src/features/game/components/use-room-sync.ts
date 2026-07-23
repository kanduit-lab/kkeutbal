'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createRoomChannel, onRoomEvent, resetRealtimeSocket } from '@/lib/realtime/client'
import type { RoomEvent } from '@/lib/realtime/events'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { refreshRoom } from '../actions'
import type { RoomSnapshot } from '../types'
import type { ActionResult } from '@/lib/action-result'

/** 이벤트 유입 refetch 트레일링 디바운스. */
const EVENT_DEBOUNCE_MS = 250
/** 이벤트 유입 refetch 최소 간격 — 이벤트 폭주 시 서버 호출을 1초에 한 번으로 묶는다. */
const MIN_EVENT_INTERVAL_MS = 1_000
/** CLOSED 자동 재구독 백오프. 마지막 값이 상한이다. */
const RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 20_000, 30_000] as const
/** 구독 시작 후 이 시간 안에 SUBSCRIBED 가 안 오면 연결 실패로 표면화한다. */
const CONNECT_TIMEOUT_MS = 10_000
/** 연속 refetch 실패가 이 횟수에 닿으면 syncFailed 를 켠다 — 1회 실패는 일시 오류로 본다. */
const SYNC_FAIL_THRESHOLD = 2
/** 재시도로 복구될 수 없는 실패 — 배너 대신 인증 안내가 필요하다. 서버 문구와 문자열 일치. */
const AUTH_ERROR_MESSAGES: ReadonlySet<string> = new Set([
  '로그인이 필요합니다',
  '이 방의 참가자가 아닙니다',
])

/**
 * 방 실시간 동기화 훅 — 채널 구독·Presence·폴링·재접속을 소유한다.
 *
 * 진실은 서버 스냅샷이다. 실시간 이벤트는 "지금 다시 읽어라" 힌트 + 즉시 표시 값일 뿐이다.
 * RoomClient(조작)와 MonitorClient(읽기 전용)가 공유한다.
 *
 * 연결 상태 표면:
 * - `connected`/`everConnected` — 기존 배너 조건(everConnected && !connected)용.
 * - `connectTimedOut` — 최초 구독이 10초 안에 안 끝났다. everConnected 가 false 라 기존 배너
 *   조건에 안 걸리는 구간을 메운다. 소비자는 배너 조건에 `|| connectTimedOut` 을 더하면 된다.
 * - `syncFailed` — refetch 연속 2회 실패. 채널과 무관하게 스냅샷 동기화가 죽었다는 뜻.
 * - `authError` — 세션 만료·추방 등 재시도로 복구 불가한 실패 문구. null 이면 정상.
 */
export function useRoomSync({
  initial,
  selfId,
  spectator = false,
  onEvent,
}: {
  initial: RoomSnapshot
  selfId: string
  /**
   * 관전 모드 — Presence track() 을 생략해 이 기기가 접속자·좌석 온라인으로 잡히지 않게 한다.
   * 브로드캐스트 구독·폴링은 그대로 유지된다. 전광판(MonitorClient) 등 읽기 전용 화면용.
   */
  spectator?: boolean
  /** 검증 통과한 수신 이벤트 훅 — 사운드·토스트 등 표시용. 상태 반영은 refetch 가 한다. */
  onEvent?: (event: RoomEvent, current: RoomSnapshot) => void
}) {
  const router = useRouter()
  const [snapshot, setSnapshot] = useState<RoomSnapshot>(initial)
  // 관전 기기는 자기 자신을 온라인으로 세지 않는다 — presence sync 가 오기 전에도 마찬가지.
  const [online, setOnline] = useState<ReadonlySet<string>>(
    () => new Set<string>(spectator ? [] : [selfId]),
  )
  const [connected, setConnected] = useState(false)
  /** 최초 구독 완료 전에는 "연결 끊김"을 띄우지 않는다 — 접속 초기 오탐 방지. */
  const [everConnected, setEverConnected] = useState(false)
  const [connectTimedOut, setConnectTimedOut] = useState(false)
  const [syncFailed, setSyncFailed] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  /** 증가하면 채널을 처음부터 다시 구독한다 — 수동·자동 재접속 공용. */
  const [epoch, setEpoch] = useState(0)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 이벤트 유입 refetch 가 마지막으로 실행된 시각 — 최소 간격 계산용. */
  const lastEventRefetchAt = useRef(0)
  /** refetch 단조 순번 — 늦게 도착한 응답이 더 새 스냅샷을 덮어쓰지 못하게 한다. */
  const refetchSeqRef = useRef(0)
  const failStreakRef = useRef(0)
  /** CLOSED 자동 재구독 시도 횟수 — SUBSCRIBED 성공 시 리셋. epoch 을 넘어 유지된다. */
  const retryAttemptRef = useRef(0)
  /** 이벤트 콜백·리스너에서 최신 연결 상태를 읽기 위한 미러. */
  const connectedRef = useRef(false)
  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  const roomId = initial.room.id

  const setConnectedBoth = useCallback((value: boolean) => {
    connectedRef.current = value
    setConnected(value)
  }, [])

  const refetch = useCallback(async (): Promise<ActionResult<RoomSnapshot>> => {
    const seq = ++refetchSeqRef.current
    let result: ActionResult<RoomSnapshot>
    try {
      result = await refreshRoom(roomId)
    } catch (error) {
      // 네트워크 단절 등 Server Action reject 도 동기화 실패로 취급한다.
      console.error('refreshRoom failed:', error)
      result = { success: false, error: '동기화에 실패했습니다' }
    }

    if (!result.success) {
      failStreakRef.current += 1
      if (failStreakRef.current >= SYNC_FAIL_THRESHOLD) setSyncFailed(true)
      if (AUTH_ERROR_MESSAGES.has(result.error)) setAuthError(result.error)
      return result
    }

    failStreakRef.current = 0
    setSyncFailed(false)
    setAuthError(null)
    // 이 응답이 도는 사이 더 새 refetch 가 시작됐다면 반영하지 않는다 — 그쪽이 곧 덮는다.
    if (seq !== refetchSeqRef.current) return result

    const next = result.data
    // 내용이 같으면 참조를 유지해 무변화 폴링 리렌더를 없앤다. 스냅샷은 작아 stringify 로 충분.
    setSnapshot((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    if (next.room.status === 'settled' || next.room.status === 'closed') {
      router.push(`/rooms/${next.room.code}/result`)
    }
    return result
  }, [roomId, router])

  /**
   * 이벤트 유입 전용 refetch — 250ms 트레일링 디바운스 + 1초 최소 간격.
   * 직전 실행 후 1초가 안 지났으면 남은 시간만큼 더 미뤄 폭주를 묶는다.
   * 폴링·visibility·afterMutation 은 이 경로를 타지 않고 refetch 를 직접 부른다.
   */
  const debouncedRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current)
    const sinceLast = Date.now() - lastEventRefetchAt.current
    const delay = Math.max(EVENT_DEBOUNCE_MS, MIN_EVENT_INTERVAL_MS - sinceLast)
    refetchTimer.current = setTimeout(() => {
      lastEventRefetchAt.current = Date.now()
      void refetch()
    }, delay)
  }, [refetch])

  /** 수동 재접속 — 죽은 웹소켓을 끊고 새 소켓으로 즉시 다시 구독한다. */
  const reconnect = useCallback(() => {
    resetRealtimeSocket()
    setEpoch((current) => current + 1)
  }, [])

  /** 채널 구독 + Presence + 생명주기 리스너. 재연결 시 스냅샷을 다시 당겨 공백을 메운다. */
  useEffect(() => {
    /** 이 epoch 의 cleanup 이후 도착하는 늦은 콜백 차단 — 새 채널 상태를 덮어쓰지 않는다. */
    let disposed = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    const self = snapshotRef.current.members.find((member) => member.userId === selfId)
    const channel = createRoomChannel(roomId, selfId)
    channelRef.current = channel

    const connectTimer = setTimeout(() => {
      if (!disposed && !connectedRef.current) setConnectTimedOut(true)
    }, CONNECT_TIMEOUT_MS)

    onRoomEvent(channel, (event) => {
      onEventRef.current?.(event, snapshotRef.current)
      debouncedRefetch()
    })

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      setOnline(new Set(Object.keys(state)))
      debouncedRefetch() // 새 참가자 입장 감지
    })

    channel.subscribe((status) => {
      if (disposed) return
      if (status === 'SUBSCRIBED') {
        clearTimeout(connectTimer)
        setConnectTimedOut(false)
        retryAttemptRef.current = 0
        setConnectedBoth(true)
        setEverConnected(true)
        // 관전 기기는 track 하지 않는다 — 전광판이 접속자·좌석 온라인으로 표시되면 안 된다.
        if (!spectator) {
          void channel.track({ userId: selfId, displayName: self?.displayName ?? '' })
        }
        void refetch() // 구독 직전 공백 복원
        return
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setConnectedBoth(false)
      }
      if (status === 'CLOSED') {
        // 서버가 닫은 채널은 스스로 살아나지 않는다 — 지수 백오프로 재구독을 예약한다.
        const delay =
          RETRY_DELAYS_MS[Math.min(retryAttemptRef.current, RETRY_DELAYS_MS.length - 1)]
        retryAttemptRef.current += 1
        if (retryTimer) clearTimeout(retryTimer)
        retryTimer = setTimeout(() => {
          if (!disposed) setEpoch((current) => current + 1)
        }, delay)
      }
    })

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void refetch()
    }, 20_000)
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      void refetch()
      if (!connectedRef.current) reconnect()
    }
    const onPageShow = (event: PageTransitionEvent) => {
      // bfcache 복원 — 얼려졌던 페이지의 소켓은 죽어 있을 수 있다.
      if (event.persisted) reconnect()
    }
    const onOnline = () => {
      void refetch()
      if (!connectedRef.current) reconnect()
    }
    const onOffline = () => {
      setConnectedBoth(false)
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      disposed = true
      clearTimeout(connectTimer)
      if (retryTimer) clearTimeout(retryTimer)
      if (refetchTimer.current) {
        clearTimeout(refetchTimer.current)
        refetchTimer.current = null
      }
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      // unsubscribe 만으로는 소켓의 채널 목록에 잔재가 남는다 — removeChannel 로 완전 해제.
      void getSupabaseBrowser().removeChannel(channel)
      channelRef.current = null
    }
  }, [roomId, selfId, spectator, debouncedRefetch, refetch, reconnect, setConnectedBoth, epoch])

  return {
    snapshot,
    online,
    connected,
    everConnected,
    connectTimedOut,
    syncFailed,
    authError,
    refetch,
    reconnect,
    channelRef,
  }
}
