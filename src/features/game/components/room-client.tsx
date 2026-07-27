'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { format, translateError, useDict } from '@/lib/i18n/client'
import { sendRoomEvent } from '@/lib/realtime/client'
import { isMuted, setMuted } from '@/lib/sound'
import type { MemberView, RoomSnapshot } from '../types'
import { useToast } from '@/components/ui'
import { AUTH_ERROR_KEYS, useRoomSync } from './use-room-sync'
import { useRoomEventFeedback } from './use-room-event-feedback'
import { RoomHeader } from './room-header'
import { RoomConnectionBar } from './room-connection-bar'
import { GameTable } from './game-table'
import { ActionBar } from './action-bar'
import { DealerPanel } from './dealer-panel'
import { LobbyPanel } from './lobby-panel'
import { MemberSheet } from './member-sheet'
import { RoundLog } from './round-log'
import { FairnessPanel } from './fairness-panel'
import type { BroadcastSpec, RunAction } from './shared'

/**
 * SSR 안전 미디어쿼리 훅 — 서버 스냅샷은 false(모바일 취급)지만 클라이언트 첫 렌더는
 * 이미 실제 값을 읽는다. effect 로만 동기화하면 데스크톱에서 하단 고정 바가 한 프레임
 * 번쩍인 뒤 인라인 패널로 튄다.
 * ActionBar 를 한 인스턴스만 마운트해 레이즈 열림 상태·입력값이 브레이크포인트 전환에도 유지되게 한다.
 */
function useIsDesktop(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const media = window.matchMedia(query)
      media.addEventListener('change', onStoreChange)
      return () => media.removeEventListener('change', onStoreChange)
    },
    [query],
  )
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

/**
 * 방 실시간 오케스트레이터. 동기화는 useRoomSync 가 소유한다.
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
  const { d } = useDict()
  const [seatUserId, setSeatUserId] = useState<string | null>(null)
  const [muted, setMutedState] = useState(() => isMuted())
  const isDesktop = useIsDesktop('(min-width: 1024px)')

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
  // connectTimedOut 은 최초 구독이 늦어지는 구간(everConnected=false)을 배너로 메운다.
  const showDisconnected = (everConnected && !connected) || connectTimedOut
  const roomId = initial.room.id
  const roomCode = initial.room.code

  /**
   * 스냅샷이 임의로 낡았을 때는 조작을 잠근다. 지금 화면의 잔액·팟은 서버 값이 아니고,
   * 그 위에서 계산한 콜 금액·최소 레이즈로 베팅하면 거절되거나 의도와 다른 금액이 나간다.
   */
  const staleReason = syncFailed ? d.room.staleGate : null

  // 재시도로 복구 불가한 실패 — 세션 만료는 로그인으로, 추방·미참가는 홈으로 보낸다.
  // 말없이 튕기면 사용자는 자기가 뭘 잘못 눌렀다고 읽는다 — 사유를 먼저 알린다.
  useEffect(() => {
    if (!authError) return
    if (authError === AUTH_ERROR_KEYS.loginRequired) {
      toast(d.room.sessionExpired, 'error')
      // 재로그인 후 홈이 아니라 이 방으로 돌아오게 한다.
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
    [refetch, channelRef, roomId, selfId],
  )

  const runAction: RunAction = useCallback(
    async (run, onSuccess) => {
      /** 성공 확정 후 던진 예외(브로드캐스트·refetch)를 액션 실패로 오인하지 않기 위한 표식. */
      let actionSucceeded = false
      try {
        // 서버가 응답하지 않아도 버튼이 영원히 잠기지 않게 15초 타임아웃을 둔다.
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
            }, 15_000),
          ),
        ])
        if (!result.success) {
          // 서버 액션 에러는 errors.* 키 또는 한국어 원문 — translateError 가 키만 번역한다.
          toast(translateError(d, result.error), 'error')
          if (timedOut) {
            // 타임아웃이어도 서버에서는 이미 커밋됐을 수 있다 — 스냅샷을 당겨 재탭(중복 입력)
            // 대신 실제 반영 여부를 보여준다. 늦게 도착한 성공 응답도 한 번 더 당긴다.
            void refetch()
            pending.then(
              (late) => {
                if (late.success) void refetch()
              },
              () => undefined, // 늦은 거부는 unhandled rejection 만 막고 버린다
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
          // 성공 후 브로드캐스트·refetch 실패는 액션 실패가 아니다 — 이벤트는 힌트일 뿐이고
          // 피어는 폴링·state.snapshot 으로 어차피 복구된다. 성공으로 처리한다.
          console.error('post-action sync failed:', error)
          return true
        }
        // Server Action reject(네트워크 단절 등) — 실패 토스트로 수렴시키되, 서버에서는
        // 커밋됐을 수 있으니 스냅샷을 당겨 중복 재시도를 막는다.
        console.error('runAction failed:', error)
        toast(d.room.networkError, 'error')
        void refetch()
        return false
      }
    },
    [afterMutation, refetch, toast, d],
  )

  const self = useMemo(
    () => snapshot.members.find((member) => member.userId === selfId) ?? null,
    [snapshot.members, selfId],
  )

  /**
   * 강퇴 감지 — 이 페이지는 입장(멤버십) 후에만 렌더되므로, 스냅샷에서 내가 사라지면
   * 내보내진 것이다 (refreshRoom 은 비멤버 열람을 허용해 authError 로는 잡히지 않는다).
   */
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

  const isHost = self?.role === 'host'
  const isDealer = isHost || self?.role === 'dealer'
  const pendingActions = useMemo(
    () => snapshot.actions.filter((action) => action.status === 'pending'),
    [snapshot.actions],
  )
  const latestAuditableRound = useMemo(
    () => snapshot.recentRounds.find((round) => round.hasFairnessAudit) ?? null,
    [snapshot.recentRounds],
  )

  const toggleMute = useCallback(() => {
    setMutedState((current) => {
      const next = !current
      setMuted(next)
      return next
    })
  }, [])

  /** 첫 판 전 로비 — 코드 공유와 참가자 확인에 집중한다. */
  const isLobby = snapshot.room.status === 'waiting'
  // 고스톱은 베팅 없이 판 종료 시 점수로 정산한다 — 베팅 바를 렌더하지 않는다.
  const isBettingGame = snapshot.room.gameType !== 'gostop'
  const canBet = Boolean(self && self.role !== 'observer') && isBettingGame && !isLobby

  const seatMember = seatUserId
    ? (snapshot.members.find((member) => member.userId === seatUserId) ?? null)
    : null
  /**
   * 시트는 닫히는 동안(퇴장 애니메이션 180ms)에도 내용을 그려야 한다 — seatUserId 가
   * 비워져도 마지막으로 연 멤버를 유지한다. 렌더 중 상태 조정은 React 공식 패턴이다.
   */
  const [sheetMember, setSheetMember] = useState<MemberView | null>(null)
  if (seatMember && seatMember !== sheetMember) setSheetMember(seatMember)

  return (
    <main
      id="main"
      // 하단 고정 ActionBar 높이는 레이즈 패널 개폐로 114~274px 사이를 오간다. 상수로
      // 잡아 두면 로비·고스톱·관전 화면에는 죽은 여백이, 레이즈 중에는 가림이 생긴다 —
      // ActionBar 가 ResizeObserver 로 실제 높이를 --action-bar-h 에 쓴다.
      className="mx-auto w-full max-w-6xl px-4 pb-[calc(var(--action-bar-h,0px)+1.5rem)] pt-5 lg:px-8 lg:pb-12 lg:pt-8"
    >
      <RoomHeader
        snapshot={snapshot}
        isHost={isHost}
        muted={muted}
        onToggleMute={toggleMute}
      />

      <RoomConnectionBar
        syncFailed={syncFailed}
        disconnected={showDisconnected}
        onReconnect={() => {
          // 채널 재구독 + 즉시 refetch — 채널이 멀쩡한데 동기화만 죽은 경우도 복구한다.
          reconnect()
          void refetch()
        }}
      />

      {isLobby ? (
        <div className="rise-in rise-in-1 mx-auto max-w-xl">
          <LobbyPanel
            snapshot={snapshot}
            online={online}
            selfId={selfId}
            runAction={runAction}
            staleReason={staleReason}
            onMemberTap={setSeatUserId}
          />
        </div>
      ) : (
        <div className="lg:grid lg:grid-cols-12 lg:gap-6">
          <div className="lg:col-span-7 xl:col-span-8">
            <div className="rise-in rise-in-1">
              <FairnessPanel
                snapshot={snapshot}
                selfId={selfId}
                runAction={runAction}
                staleReason={staleReason}
              />
            </div>
            {snapshot.lastResult && !snapshot.currentRound ? (
              <p className="rise-in rise-in-1 mb-2 text-center text-xs text-muted lg:text-sm">
                {/* 무효 판은 lastResult 에 오지 않는다 — 승자 미상은 '?' 로만 표기. */}
                {format(d.room.lastRoundSummary, {
                  seq: snapshot.lastResult.seq,
                  name:
                    snapshot.members.find((m) => m.userId === snapshot.lastResult?.winnerId)
                      ?.displayName ?? '?',
                  pot: snapshot.lastResult.pot.toLocaleString(),
                })}
                {snapshot.lastResult.note ? ` · ${snapshot.lastResult.note}` : ''}
                {snapshot.lastResult.hasFairnessAudit ? (
                  <Link
                    href={`/rooms/${snapshot.room.code}/fairness/${snapshot.lastResult.seq}` as Route}
                    className="ml-2 font-bold text-accent underline underline-offset-2"
                  >
                    {d.fairness.auditLink}
                  </Link>
                ) : null}
              </p>
            ) : null}
            {!snapshot.currentRound &&
            latestAuditableRound &&
            latestAuditableRound.roundId !== snapshot.lastResult?.roundId ? (
              <p className="mb-2 text-center text-xs text-muted lg:text-sm">
                <Link
                  href={`/rooms/${snapshot.room.code}/fairness/${latestAuditableRound.seq}` as Route}
                  className="font-bold text-accent underline underline-offset-2"
                >
                  {d.fairness.auditLink}
                </Link>
              </p>
            ) : null}

            <div className="rise-in rise-in-2 pt-6">
              <GameTable
                members={snapshot.members}
                online={online}
                selfId={selfId}
                pot={snapshot.currentRound?.pot ?? 0}
                actions={snapshot.actions}
                winnerId={snapshot.currentRound ? null : (snapshot.lastResult?.winnerId ?? null)}
                roundActive={Boolean(snapshot.currentRound)}
                gameType={snapshot.room.gameType}
                onSeatTap={(member) => setSeatUserId(member.userId)}
              />
            </div>

            {/* 단일 ActionBar — inline 여부만 바뀌므로 브레이크포인트 전환에도 상태가 유지된다.
                모바일 바는 fixed 라 DOM 위치와 무관하게 하단에 붙는다. */}
            {canBet && self ? (
              <div className={isDesktop ? 'rise-in rise-in-3' : undefined}>
                <ActionBar
                  snapshot={snapshot}
                  self={self}
                  runAction={runAction}
                  staleReason={staleReason}
                  inline={isDesktop}
                />
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
                  staleReason={staleReason}
                />
              </div>
            ) : null}

            <div className="rise-in rise-in-3">
              <RoundLog actions={snapshot.actions} members={snapshot.members} />
            </div>
          </div>
        </div>
      )}

      {sheetMember ? (
        <MemberSheet
          open={seatUserId !== null}
          member={sheetMember}
          snapshot={snapshot}
          selfId={selfId}
          runAction={runAction}
          onClose={() => setSeatUserId(null)}
        />
      ) : null}
    </main>
  )
}
