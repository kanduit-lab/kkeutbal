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

const EVENT_DEBOUNCE_MS = 250

const MIN_EVENT_INTERVAL_MS = 1_000

const RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 20_000, 30_000] as const

const CONNECT_TIMEOUT_MS = 10_000

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

  const lastEventRefetchAt = useRef(0)

  const refetchSeqRef = useRef(0)
  const failStreakRef = useRef(0)

  const retryAttemptRef = useRef(0)

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

    if (seq !== refetchSeqRef.current) return result

    const next = result.data

    setSnapshot((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    if (next.room.status === 'settled' || next.room.status === 'closed') {
      router.push(`/rooms/${next.room.code}/result`)
    }
    return result
  }, [roomId, router])

  const debouncedRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current)
    const sinceLast = Date.now() - lastEventRefetchAt.current
    const delay = Math.max(EVENT_DEBOUNCE_MS, MIN_EVENT_INTERVAL_MS - sinceLast)
    refetchTimer.current = setTimeout(() => {
      lastEventRefetchAt.current = Date.now()
      void refetch()
    }, delay)
  }, [refetch])

  const reconnect = useCallback(() => {
    setConnectedBoth(false)
    resetRealtimeSocket()
    setEpoch((current) => current + 1)
  }, [setConnectedBoth])

  useEffect(() => {
    let disposed = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    const self = snapshotRef.current.members.find((member) => member.userId === selfId)
    const channel = createRoomChannel(roomId, selfId)
    channelRef.current = channel

    const connectTimer = setTimeout(() => {
      if (!disposed && !connectedRef.current) setConnectTimedOut(true)
    }, CONNECT_TIMEOUT_MS)

    onRoomEvent(channel, roomId, (event) => {
      onEventRef.current?.(event, snapshotRef.current)
      debouncedRefetch()
    })

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      setOnline(new Set(Object.keys(state)))
      debouncedRefetch()
    })

    channel.subscribe((status) => {
      if (disposed) return
      if (status === 'SUBSCRIBED') {
        clearTimeout(connectTimer)
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
      }
      if (status === 'CLOSED') {
        const delay = RETRY_DELAYS_MS[Math.min(retryAttemptRef.current, RETRY_DELAYS_MS.length - 1)]
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