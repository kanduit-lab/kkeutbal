'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { format, translateError, useDict } from '@/lib/i18n/client'
import { sendRoomEvent } from '@/lib/realtime/client'
import type { RoomEvent } from '@/lib/realtime/events'
import { isMuted, playChip, playRoundStart, playWin, setMuted } from '@/lib/sound'
import type { RoomSnapshot } from '../types'
import { Badge, useToast } from '@/components/ui'
import { AUTH_ERROR_KEYS, useRoomSync } from './use-room-sync'
import { GameTable } from './game-table'
import { ActionBar } from './action-bar'
import { DealerPanel } from './dealer-panel'
import { LobbyPanel } from './lobby-panel'
import { MemberSheet } from './member-sheet'
import { RoundLog } from './round-log'
import type { BroadcastSpec, RunAction } from './shared'

/**
 * SSR 안전 미디어쿼리 훅 — 서버·첫 렌더는 false(모바일 취급), 마운트 시 동기화 후 변경을 구독한다.
 * ActionBar 를 한 인스턴스만 마운트해 레이즈 열림 상태·입력값이 브레이크포인트 전환에도 유지되게 한다.
 */
function useIsDesktop(query: string): boolean {
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const media = window.matchMedia(query)
    setIsDesktop(media.matches)
    const onChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [query])
  return isDesktop
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

  const onEvent = useCallback(
    (event: RoomEvent, current: RoomSnapshot) => {
      /** 내 액션에만 개인 피드백을 띄운다 — 승인·거절·되돌림 공용 판정. */
      const isMyAction = (actionId: string) =>
        current.actions.some((action) => action.id === actionId && action.userId === selfId)

      switch (event.name) {
        case 'bet.placed':
          if (event.payload.amount > 0) playChip()
          break
        case 'bet.approved':
          if (isMyAction(event.payload.actionId)) toast(d.room.toastBetApproved, 'success')
          break
        case 'bet.rejected':
          if (isMyAction(event.payload.actionId)) {
            toast(format(d.room.toastBetRejected, { reason: event.payload.reason }), 'error')
          }
          break
        case 'bet.reverted':
          if (isMyAction(event.payload.actionId)) {
            toast(format(d.room.toastBetReverted, { reason: event.payload.reason }), 'error')
          }
          break
        case 'round.started':
          toast(format(d.room.toastRoundStarted, { seq: event.payload.seq }), 'info')
          playRoundStart()
          break
        case 'round.ended': {
          const winner = current.members.find(
            (member) => member.userId === event.payload.winnerId,
          )
          if (winner) {
            toast(
              format(d.room.toastRoundWon, {
                name: winner.displayName,
                pot: event.payload.pot.toLocaleString(),
              }),
              'success',
            )
            playWin()
          }
          break
        }
        case 'round.voided':
          // 무효는 전원의 베팅을 되돌린다 — 전원에게 사유와 함께 알린다.
          toast(
            format(d.room.toastRoundVoided, {
              seq: event.payload.seq,
              reason: event.payload.reason,
            }),
            'error',
          )
          break
        default:
          break
      }
    },
    [selfId, toast, d],
  )

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

  // 재시도로 복구 불가한 실패 — 세션 만료는 로그인으로, 추방·미참가는 홈으로 보낸다.
  useEffect(() => {
    if (!authError) return
    router.push(authError === AUTH_ERROR_KEYS.loginRequired ? '/login' : '/')
  }, [authError, router])

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

  function toggleMute() {
    const next = !muted
    setMuted(next)
    setMutedState(next)
  }

  /** 첫 판 전 로비 — 코드 공유와 참가자 확인에 집중한다. */
  const isLobby = snapshot.room.status === 'waiting'
  // 고스톱은 베팅 없이 판 종료 시 점수로 정산한다 — 베팅 바를 렌더하지 않는다.
  const isBettingGame = snapshot.room.gameType !== 'gostop'
  const canBet = Boolean(self && self.role !== 'observer') && isBettingGame && !isLobby

  const sheetMember = seatUserId
    ? (snapshot.members.find((member) => member.userId === seatUserId) ?? null)
    : null

  const iconLinkClass =
    'inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg border border-white/10 px-2 py-1.5 text-sm text-muted transition-colors hover:text-text'

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-56 pt-5 lg:px-8 lg:pb-12 lg:pt-8">
      <header className="rise-in mb-5 flex items-center justify-between lg:mb-8">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            aria-label={d.room.backAria}
            className="inline-flex min-h-12 min-w-12 items-center justify-center text-xl text-muted transition-colors hover:text-text"
          >
            ←
          </Link>
          <div className="min-w-0">
            <h1 className="truncate font-brush text-xl font-bold leading-tight lg:text-3xl">
              {snapshot.room.name}
            </h1>
            <p className="mt-0.5 text-xs text-muted lg:text-sm">
              {d.room.codeLabel}{' '}
              <span className="font-mono font-bold tracking-widest">{snapshot.room.code}</span>
              {' · '}
              {d.games[snapshot.room.gameType]}
              {' · '}
              {snapshot.room.inputMode === 'trust' ? d.inputMode.trust : d.inputMode.approval}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {syncFailed || showDisconnected ? (
            <button
              type="button"
              onClick={() => {
                // 채널 재구독 + 즉시 refetch — 채널이 멀쩡한데 동기화만 죽은 경우도 복구한다.
                reconnect()
                void refetch()
              }}
              className="min-h-11 rounded-md bg-warn/20 px-2 py-1 text-xs font-bold text-warn"
            >
              {syncFailed ? d.room.syncFailedReconnect : d.room.disconnectedReconnect}
            </button>
          ) : null}
          {/* 서버 렌더는 항상 muted(🔇) — localStorage 값과 다를 수 있어 경고만 억제한다. */}
          <button
            type="button"
            onClick={toggleMute}
            aria-pressed={muted}
            aria-label={muted ? d.room.soundOnAria : d.room.soundOffAria}
            suppressHydrationWarning
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg border border-white/10 px-2 py-1.5 text-sm transition-colors hover:text-text"
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <Link
            href={`/rooms/${snapshot.room.code}/result`}
            aria-label={d.room.resultAria}
            title={d.room.resultAria}
            className={iconLinkClass}
          >
            🧾
          </Link>
          <Link
            href={`/rooms/${snapshot.room.code}/monitor`}
            aria-label={d.room.monitorAria}
            title={d.room.monitorTitle}
            className={iconLinkClass}
          >
            📺
          </Link>
          {isHost ? (
            <Link
              href={`/rooms/${snapshot.room.code}/settings`}
              aria-label={d.room.settingsAria}
              title={d.room.settingsTitle}
              className={iconLinkClass}
            >
              ⚙️
            </Link>
          ) : null}
          <Badge tone={snapshot.currentRound ? 'win' : 'muted'}>
            {snapshot.currentRound
              ? format(d.room.roundLive, { seq: snapshot.currentRound.seq })
              : d.common.waiting}
          </Badge>
        </div>
      </header>

      {isLobby ? (
        <div className="rise-in rise-in-1 mx-auto max-w-xl">
          <LobbyPanel
            snapshot={snapshot}
            online={online}
            selfId={selfId}
            runAction={runAction}
            onMemberTap={setSeatUserId}
          />
        </div>
      ) : (
        <div className="lg:grid lg:grid-cols-12 lg:gap-6">
          <div className="lg:col-span-7 xl:col-span-8">
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
                <ActionBar snapshot={snapshot} self={self} runAction={runAction} inline={isDesktop} />
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
      )}

      {sheetMember ? (
        <MemberSheet
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
