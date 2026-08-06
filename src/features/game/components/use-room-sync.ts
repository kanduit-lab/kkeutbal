'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createRoomChannel, onRoomEvent, resetRealtimeSocket } from '@/lib/realtime/client'
import { nextReconnectDelayMs, shouldRetryConnect } from '@/lib/realtime/reconnect-backoff'
import { SeenEventIds } from '@/lib/realtime/seen-events'
import { SnapshotOrderGuard } from '@/lib/realtime/snapshot-order'
import type { RoomEvent } from '@/lib/realtime/events'
import { syncActionFor } from '@/lib/realtime/event-sync-policy'
import { presenceRevealsUnknownMember } from '@/lib/realtime/presence-policy'
import {
  INITIAL_COALESCER_STATE,
  noteCoalescedEvent,
  noteCoalescedRefetchRan,
  type CoalescerState,
} from '@/lib/realtime/refetch-coalescer'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { withTimeout } from '@/lib/with-timeout'
import { refreshRoom } from '../actions'
import type { RoomSnapshot } from '../types'
import type { ActionResult } from '@/lib/action-result'
import { REFETCH_TIMEOUT_MS } from './sync-timeouts'
import { applyStateSnapshotHint } from './state-snapshot-hint'

const CONNECT_TIMEOUT_MS = 10_000

const POLL_INTERVAL_MS = 20_000

const SYNC_FAIL_THRESHOLD = 2

export const AUTH_ERROR_KEYS = {
  loginRequired: 'errors.loginRequired',
  notMember: 'errors.notMember',
} as const

const AUTH_ERROR_MESSAGES: ReadonlySet<string> = new Set(Object.values(AUTH_ERROR_KEYS))

export function useRoomSync({
  initial,
  selfId,
  spectator = false,
  onEvent,
}: {
  initial: RoomSnapshot
  selfId: string

  spectator?: boolean

  onEvent?: (event: RoomEvent, current: RoomSnapshot) => void
}) {
  const router = useRouter()
  const [snapshot, setSnapshot] = useState<RoomSnapshot>(initial)

  const [online, setOnline] = useState<ReadonlySet<string>>(
    () => new Set<string>(spectator ? [] : [selfId]),
  )
  const [connected, setConnected] = useState(false)

  const [everConnected, setEverConnected] = useState(false)
  const [connectTimedOut, setConnectTimedOut] = useState(false)
  const [syncFailed, setSyncFailed] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const [epoch, setEpoch] = useState(0)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const coalescerStateRef = useRef<CoalescerState>(INITIAL_COALESCER_STATE)

  const orderRef = useRef<SnapshotOrderGuard | null>(null)
  const failStreakRef = useRef(0)

  const retryAttemptRef = useRef(0)
  const seenEventIdsRef = useRef<SeenEventIds | null>(null)
  if (!seenEventIdsRef.current) seenEventIdsRef.current = new SeenEventIds()

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
    const order = (orderRef.current ??= new SnapshotOrderGuard())
    const seq = order.issue()
    let result: ActionResult<RoomSnapshot>
    try {
      result = await withTimeout(refreshRoom(roomId), REFETCH_TIMEOUT_MS, 'refreshRoom')
    } catch (error) {
      console.error('refreshRoom failed:', error)
      result = { success: false, error: 'errors.syncFailed' }
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

    // 순서 가드는 "마지막으로 **반영된**" 순번과 비교한다 — "마지막으로 발행된" 순번과
    // 비교하면(예전 구현) refetch 지연이 이벤트 간격(1초)보다 길어지는 순간 모든 응답이
    // 자기보다 새 요청을 발견하고 버려져, 베팅이 몰릴수록 화면이 멈춘다. 상세는
    // `snapshot-order.ts`.
    if (!order.accept(seq)) return result

    const next = result.data

    setSnapshot((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    if (next.room.status === 'settled' || next.room.status === 'closed') {
      router.push(`/rooms/${next.room.code}/result`)
    }
    return result
  }, [roomId, router])

  const debouncedRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current)
    const { delayMs, state } = noteCoalescedEvent(coalescerStateRef.current, Date.now())
    coalescerStateRef.current = state
    refetchTimer.current = setTimeout(() => {
      coalescerStateRef.current = noteCoalescedRefetchRan(Date.now())
      void refetch()
    }, delayMs)
  }, [refetch])

  const reconnect = useCallback(() => {
    setConnectedBoth(false)
    // 자동 재구독 예산(`MAX_RECONNECT_ATTEMPTS`)을 되돌린다. 수동 "다시 연결"·`online`·
    // 탭 복귀는 전부 "조건이 달라졌다"는 신호인데, 카운터를 그대로 두면 예산을 다 쓴 방은
    // 재연결이 한 번 더 실패하는 순간 다시 영영 자동 복구를 안 한다 — 사용자가 배너를
    // 계속 눌러야 하는 상태가 된다.
    retryAttemptRef.current = 0
    resetRealtimeSocket()
    setEpoch((current) => current + 1)
  }, [setConnectedBoth])

  // 연결 타임아웃은 **방에 들어온 시점 기준으로 한 번만** 돈다. 아래 채널 effect 안에 두면
  // 재구독 시도마다(`epoch` 증가) 타이머가 새로 걸려 초기화되는데, 백오프 초반 간격이 1·2·5초라
  // 10초를 넘기지 못하고 계속 리셋된다. 그래서 "한 번도 붙지 못한" 방에서 끊김 배너가 간격이
  // 10초를 넘는 4~5번째 시도(대략 20~40초)에야 떴고, 그동안 사용자는 동기화가 멈춘 화면을 아무
  // 표시 없이 봤다.
  //
  // 이 타이머의 역할은 "처음부터 못 붙는 경우" 하나다 — 붙으면 `SUBSCRIBED`가 상태를 내리고,
  // 붙었다가 끊긴 경우는 `everConnected && !connected`가 배너를 띄운다.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!connectedRef.current) setConnectTimedOut(true)
    }, CONNECT_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [roomId])

  useEffect(() => {
    let disposed = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    const self = snapshotRef.current.members.find((member) => member.userId === selfId)
    const channel = createRoomChannel(roomId, selfId)
    channelRef.current = channel

    onRoomEvent(channel, roomId, (event, envelope) => {
      // Reconnects can replay an event the client already reacted to. The
      // refetch decided below always runs (truth comes from there
      // regardless), but a duplicate delivery skips feedback (toast/sound)
      // so it doesn't fire twice for the same envelope id.
      const isFirstDelivery = seenEventIdsRef.current?.record(envelope.id) ?? true
      if (isFirstDelivery) onEventRef.current?.(event, snapshotRef.current)

      // state.snapshot carries values `refreshRoom` already computed
      // server-side for the sender (room-client.tsx's afterMutation) — safe
      // to paint immediately instead of waiting on our own confirming
      // refetch. Scope is deliberately narrow (see state-snapshot-hint.ts);
      // the confirming refetch below still runs and is what reconciles
      // everything else (actions log, fairness, membership).
      //
      // Gated on first delivery for the same reason feedback is, but with a
      // worse failure mode than a double toast: `sendWithRetry` re-sends the
      // *same envelope id* up to 3 times (300ms/800ms apart, client.ts), so a
      // send whose ack was lost after actually landing gets redelivered ~1.1s
      // later carrying the pot/balances from before whatever happened in
      // between. Re-applying it drags the pot backwards until the next
      // coalesced refetch. A hint is worth painting exactly once.
      if (event.name === 'state.snapshot' && isFirstDelivery) {
        setSnapshot((prev) => applyStateSnapshotHint(prev, event.payload))
      }

      // event-sync-policy.ts decides the bucket: structural round
      // transitions refetch immediately (rare, never bursty), everything else
      // schedules its own debounced refetch. No event is allowed to skip the
      // refetch on the grounds that an accompanying state.snapshot will do it
      // — that send is conditional on the sender's own refetch succeeding
      // (see the policy comment), so it can silently not happen.
      switch (syncActionFor(event.name)) {
        case 'immediate':
          void refetch()
          break
        case 'coalesced':
          debouncedRefetch()
          break
      }
    })

    channel.on('presence', { event: 'sync' }, () => {
      const presenceState = channel.presenceState()
      const onlineIds = new Set(Object.keys(presenceState))
      setOnline(onlineIds)

      // Reconnect flicker among members we already know about (common on
      // mobile networks) shouldn't cost a refetch — only a genuinely new
      // presence id (a join whose row we haven't fetched yet) does.
      const knownMemberIds = new Set(snapshotRef.current.members.map((member) => member.userId))
      if (presenceRevealsUnknownMember(onlineIds, knownMemberIds)) debouncedRefetch()
    })

    channel.subscribe((status) => {
      if (disposed) return
      if (status === 'SUBSCRIBED') {
        setConnectTimedOut(false)
        retryAttemptRef.current = 0
        setConnectedBoth(true)
        setEverConnected(true)

        if (!spectator) {
          void channel.track({ userId: selfId, displayName: self?.displayName ?? '' })
        }
        void refetch()
        return
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setConnectedBoth(false)
        // Previously only 'CLOSED' rescheduled a resubscribe, so a channel
        // stuck flapping between CHANNEL_ERROR/TIMED_OUT sat disconnected
        // until visibilitychange/online happened to fire. All three failure
        // statuses now share the same jittered backoff, capped so a
        // still-visible, still-online tab doesn't retry forever against a
        // channel that keeps failing — past the cap, recovery falls to the
        // visibilitychange/online handlers below (which reconnect()
        // immediately, uncounted) or the manual "다시 연결" button.
        if (shouldRetryConnect(retryAttemptRef.current)) {
          const delay = nextReconnectDelayMs(retryAttemptRef.current)
          retryAttemptRef.current += 1
          if (retryTimer) clearTimeout(retryTimer)
          retryTimer = setTimeout(() => {
            if (!disposed) setEpoch((current) => current + 1)
          }, delay)
        }
      }
    })

    return () => {
      disposed = true
      if (retryTimer) clearTimeout(retryTimer)

      void getSupabaseBrowser().removeChannel(channel)
      channelRef.current = null
    }
  }, [roomId, selfId, spectator, debouncedRefetch, refetch, setConnectedBoth, epoch])

  // 폴링과 생명주기 리스너는 채널 effect **밖**에 산다. 안에 있으면 `epoch`가 오를 때마다
  // (= 자동 재구독 시도마다) 20초 인터벌이 처음부터 다시 시작하는데, 백오프 초반 간격이
  // 1·2·5·10초라 인터벌이 20초에 닿기 전에 계속 리셋된다 — 채널이 죽어서 폴링이 유일한
  // 갱신 경로가 된 바로 그 구간에 폴링이 한 번도 안 도는 상태였다. 디바운스 타이머도 같은
  // 이유로 여기서 정리한다: 재구독이 예약된 refetch를 조용히 취소하면 안 된다.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void refetch()
    }, POLL_INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      void refetch()
      if (!connectedRef.current) reconnect()
    }
    const onPageShow = (event: PageTransitionEvent) => {
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
      clearInterval(interval)
      if (refetchTimer.current) {
        clearTimeout(refetchTimer.current)
        refetchTimer.current = null
      }
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [refetch, reconnect, setConnectedBoth])

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