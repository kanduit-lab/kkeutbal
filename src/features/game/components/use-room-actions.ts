import type { Route } from 'next'
import type { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { useToast } from '@/components/ui'
import { translateError, type Dictionary } from '@/lib/i18n/client'
import { sendRoomEvent } from '@/lib/realtime/client'
import type { MemberView, RoomSnapshot } from '../types'
import { AUTH_ERROR_KEYS, useRoomSync } from './use-room-sync'
import { useRoomEventFeedback } from './use-room-event-feedback'
import { ACTION_RACE_TIMEOUT_MS } from './sync-timeouts'
import type { BroadcastSpec, RunAction } from './shared'

type RouterLike = Pick<ReturnType<typeof useRouter>, 'push'>
type ToastFn = ReturnType<typeof useToast>['toast']

/**
 * 방 화면의 실시간 동기화 배선(`useRoomSync`) + 뮤테이션 후처리(`afterMutation`의 브로드캐스트
 * 발신) + 서버 액션 실행 레이스(`runAction`의 15초 타임아웃)를 한데 묶은 훅. `room-client.tsx`의
 * 레이아웃 JSX와 분리해서, "판이 어떻게 서버와 동기화되는가"와 "화면이 어떻게 배치되는가"를
 * 각자 읽을 수 있게 한다.
 *
 * 훅 호출 순서는 원래 room-client.tsx에서 이 로직들이 있던 자리(useRoomEventFeedback →
 * useRoomSync → useEffect → useCallback ×2 → useMemo → useRef+useEffect)를 그대로 옮긴 것이다
 * — room-client.tsx는 이 훅 하나를 그 자리에서 한 번 호출하므로, 매 렌더 펼쳐지는 훅 호출
 * 순서는 리팩터 전과 동일하다.
 *
 * `router`/`toast`/`d`는 훅 내부에서 다시 얻지 않고 호출부(room-client.tsx)가 이미 얻은 값을
 * 그대로 넘겨받는다 — useRouter/useToast/useDict 호출 위치를 옮기지 않기 위함이다.
 */
export function useRoomActions({
  initial,
  selfId,
  router,
  toast,
  d,
}: {
  initial: RoomSnapshot
  selfId: string
  router: RouterLike
  toast: ToastFn
  d: Dictionary
}) {
  const onEvent = useRoomEventFeedback(selfId)

  const {
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
  } = useRoomSync({ initial, selfId, onEvent })

  const showDisconnected = (everConnected && !connected) || connectTimedOut
  const roomId = initial.room.id
  const roomCode = initial.room.code

  const staleReason = syncFailed ? d.room.staleGate : null

  useEffect(() => {
    if (!authError) return
    if (authError === AUTH_ERROR_KEYS.loginRequired) {
      toast(d.room.sessionExpired, 'error')

      router.push(`/login?next=${encodeURIComponent(`/rooms/${roomCode}`)}` as Route)
      return
    }
    toast(translateError(d, authError), 'error')
    router.push('/')
  }, [authError, router, toast, d, roomCode])

  const afterMutation = useCallback(
    async (broadcast?: BroadcastSpec) => {
      const result = await refetch()
      const channel = channelRef.current
      if (!channel) return

      // sendRoomEvent retries internally and resolves to whether delivery is
      // believed to have gone through. Don't block this action's own success
      // path on that outcome (the actor's screen is already correct via the
      // refetch above) — just warn if it ultimately failed, since other
      // participants won't see this change until their next poll.
      const sends: Promise<boolean>[] = []
      if (broadcast) {
        sends.push(sendRoomEvent(channel, roomId, selfId, broadcast.event, broadcast.payload))
      }
      if (result.success) {
        sends.push(
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
          }),
        )
      }
      if (sends.length === 0) return

      void Promise.all(sends).then((delivered) => {
        if (delivered.some((ok) => !ok)) toast(d.room.broadcastDelayed, 'info')
      })
    },
    [refetch, channelRef, roomId, selfId, toast, d],
  )

  const runAction: RunAction = useCallback(
    async (run, onSuccess) => {
      let actionSucceeded = false
      try {
        let timedOut = false
        const pending = run()
        const result = await Promise.race([
          pending,
          new Promise<{ success: false; error: string }>((resolve) =>
            setTimeout(() => {
              timedOut = true
              resolve({
                success: false,
                error: d.room.serverSlow,
              })
            }, ACTION_RACE_TIMEOUT_MS),
          ),
        ])
        if (!result.success) {
          toast(translateError(d, result.error), 'error')
          if (timedOut) {
            void refetch()
            pending.then(
              (late) => {
                if (late.success) void refetch()
              },
              () => undefined,
            )
          }
          return false
        }
        actionSucceeded = true
        const broadcast = onSuccess?.(result.data)
        await afterMutation(broadcast ?? undefined)
        return true
      } catch (error) {
        if (actionSucceeded) {
          console.error('post-action sync failed:', error)
          return true
        }

        console.error('runAction failed:', error)
        toast(d.room.networkError, 'error')
        void refetch()
        return false
      }
    },
    [afterMutation, refetch, toast, d],
  )

  const self = useMemo(
    (): MemberView | null => snapshot.members.find((member) => member.userId === selfId) ?? null,
    [snapshot.members, selfId],
  )

  const wasMemberRef = useRef(false)
  useEffect(() => {
    if (self) {
      wasMemberRef.current = true
      return
    }
    if (wasMemberRef.current) {
      wasMemberRef.current = false
      toast(d.room.removedFromRoom, 'error')
      router.push('/')
    }
  }, [self, toast, router, d])

  return {
    snapshot,
    online,
    syncFailed,
    showDisconnected,
    staleReason,
    refetch,
    reconnect,
    runAction,
    self,
  }
}
