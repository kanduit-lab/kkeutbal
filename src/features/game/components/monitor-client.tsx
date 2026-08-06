'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { clsx } from 'clsx'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, translateError, useDict } from '@/lib/i18n/client'
import type { RoomEvent } from '@/lib/realtime/events'
import { playChip, playRoundStart, playWin } from '@/lib/sound'
import type { MemberView, RoomSnapshot } from '../types'
import { Badge, useToast } from '@/components/ui'
import { AUTH_ERROR_KEYS, useRoomSync } from './use-room-sync'
import { useWakeLock } from './use-wake-lock'
import { RoomConnectionBar } from './room-connection-bar'
import { GameTable } from './game-table'
import { RoundLog } from './round-log'

export function MonitorClient({ initial, selfId }: { initial: RoomSnapshot; selfId: string }) {
  const { d } = useDict()
  const router = useRouter()
  const { toast } = useToast()

  useWakeLock()

  const onEvent = useCallback((event: RoomEvent) => {
    if (event.name === 'bet.placed' && event.payload.amount > 0) playChip()
    if (event.name === 'round.started') playRoundStart()
    if (event.name === 'round.ended') playWin()
  }, [])

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
  } = useRoomSync({ initial, selfId, spectator: true, onEvent })

  // 전광판은 몇 시간씩 켜 두는 화면이라 세션 만료·강퇴가 여기서 제일 먼저 터진다. 그런데
  // 여태 `authError`를 아무도 안 봐서, 그 순간 남는 건 "동기화 실패" 배너와 아무리 눌러도
  // 안 되는 "다시 연결" 버튼뿐이었다 — 재시도로 복구되는 오류가 아니다(재로그인·재입장이
  // 필요하다). 방 화면(`use-room-actions.ts`)과 같은 처리를 준다.
  const roomCode = initial.room.code
  useEffect(() => {
    if (!authError) return
    if (authError === AUTH_ERROR_KEYS.loginRequired) {
      toast(d.room.sessionExpired, 'error')
      router.push(`/login?next=${encodeURIComponent(`/rooms/${roomCode}/monitor`)}` as Route)
      return
    }
    // 방에서 빠진 경우다. 방 화면으로 보내면 거기서 다시 들어갈 길이 나온다.
    toast(translateError(d, authError), 'error')
    router.push(`/rooms/${roomCode}` as Route)
  }, [authError, router, toast, d, roomCode])

  const { fullscreenSupported, isFullscreen, toggleFullscreen } = useFullscreen()

  const winnerName = snapshot.lastResult
    ? (snapshot.members.find((m) => m.userId === snapshot.lastResult?.winnerId)?.displayName ?? '?')
    : null

  const nameOf = (userId: string | null) =>
    userId ? (snapshot.members.find((member) => member.userId === userId)?.displayName ?? '?') : '?'

  const leader: MemberView | null = useMemo(() => {
    const players = snapshot.members.filter((member) => member.role !== 'observer')
    if (players.length === 0) return null
    return players.reduce((best, member) =>
      member.balance - member.buyInTotal > best.balance - best.buyInTotal ? member : best,
    )
  }, [snapshot.members])
  const leaderNet = leader ? leader.balance - leader.buyInTotal : 0

  return (
    <main
      id="main"
      // 방 화면과 같은 이유로 `fixed-page`가 필요하다(globals.css의 `body:has(> main.fixed-page)`).
      // 제약이 `lg:`로만 걸려 있어서 폰에서는 최근 판 목록이 길어지는 만큼 문서가 늘어났다 —
      // e2e가 Pixel 7에서 963px(뷰포트 840)로 잡았다. 이제 두 폭 모두 고정이고, 넘치는 목록은
      // aside 안에서 스크롤된다.
      className="fixed-page mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col overflow-hidden px-4 py-4 lg:px-8"
    >
      <div className="shrink-0">
        <header className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/rooms/${snapshot.room.code}`}
              className="inline-flex min-h-12 min-w-12 items-center justify-center text-xl text-muted transition-colors hover:text-text"
              aria-label={d.monitor.backToRoom}
              title={d.monitor.backToRoom}
            >
              ←
            </Link>
            <h1 className="font-brush text-2xl font-bold lg:text-4xl">{snapshot.room.name}</h1>
            <Badge tone="accent">{d.games[snapshot.room.gameType]}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-2xl font-black tracking-[0.3em] text-muted lg:text-3xl">
              {snapshot.room.code}
            </span>
            <Badge tone={snapshot.currentRound ? 'win' : 'muted'}>
              {snapshot.currentRound
                ? format(d.monitor.roundN, { seq: snapshot.currentRound.seq })
                : d.common.waiting}
            </Badge>
            {fullscreenSupported ? (
              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? d.monitor.fullscreenExit : d.monitor.fullscreenEnter}
                className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg border border-white/10 text-xl text-muted transition-colors hover:text-text"
              >
                ⛶
              </button>
            ) : null}
          </div>
        </header>
        <RoomConnectionBar
          syncFailed={syncFailed}
          disconnected={(everConnected && !connected) || connectTimedOut}
          onReconnect={() => {
            reconnect()
            void refetch()
          }}
        />
      </div>

      {snapshot.lastResult && !snapshot.currentRound ? (
        <p className="mb-1 shrink-0 text-center text-sm text-muted lg:text-lg">
          {format(d.monitor.lastRoundSummary, {
            seq: snapshot.lastResult.seq,
            name: winnerName ?? '?',
            pot: snapshot.lastResult.pot.toLocaleString(),
          })}
          {snapshot.lastResult.note ? ` · ${snapshot.lastResult.note}` : ''}
        </p>
      ) : null}

      {/* 모바일은 위아래로 3:2 — 판이 주인공인 화면이라 테이블이 크게 남고, 최근 판 목록은
          남은 높이 안에서 스크롤된다. 데스크톱은 기존대로 테이블 + 오른쪽 320px 사이드바다. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-h-0 min-w-0 flex-[3] pt-6 lg:flex lg:flex-1 lg:items-center lg:justify-center lg:pt-0">
          <GameTable
            members={snapshot.members}
            online={online}
            selfId={selfId}
            pot={snapshot.currentRound?.pot ?? 0}
            actions={snapshot.actions}
            winnerId={snapshot.currentRound ? null : (snapshot.lastResult?.winnerId ?? null)}
            scale="board"
            gameType={snapshot.room.gameType}
            participantUserIds={snapshot.currentRound?.participantUserIds}
            carriedPot={snapshot.carriedPot}
            fit
          />
        </div>
        <aside className="min-h-0 w-full flex-[2] overflow-y-auto overscroll-contain lg:flex lg:h-full lg:w-80 lg:flex-none lg:flex-col">
          {leader && snapshot.endedRounds > 0 ? (
            <div className="mb-4 flex items-center justify-between gap-2 rounded-2xl border border-win/30 bg-win/10 px-4 py-3">
              <span className="shrink-0 text-sm font-bold text-win">
                👑 {d.monitor.currentLeader}
              </span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-bold">{leader.displayName}</span>
                <span
                  className={clsx(
                    'shrink-0 tabular-nums font-black',
                    leaderNet >= 0 ? 'text-win' : 'text-accent',
                  )}
                >
                  {leaderNet >= 0 ? '+' : ''}
                  {leaderNet.toLocaleString()}
                </span>
              </span>
            </div>
          ) : null}
          {snapshot.recentRounds.length > 0 ? (
            <section className="mb-4 space-y-1.5">
              <h2 className="px-1 text-sm font-bold text-muted">{d.monitor.recentRounds}</h2>
              <ul className="space-y-1.5">
                {snapshot.recentRounds.map((round) => (
                  <li key={round.seq} className="rounded-xl bg-surface px-3 py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 text-muted">
                          {format(d.monitor.roundN, { seq: round.seq })}
                        </span>
                        {round.status === 'voided' ? (
                          <Badge tone="muted">{d.monitor.voided}</Badge>
                        ) : (
                          <>
                            <span className="truncate font-medium">{nameOf(round.winnerId)}</span>
                            <span className="shrink-0 tabular-nums font-bold text-warn">
                              +{round.pot.toLocaleString()}
                            </span>
                          </>
                        )}
                      </span>
                      {round.note ? (
                        <span className="ml-2 max-w-[40%] truncate text-xs text-muted">
                          {round.note}
                        </span>
                      ) : null}
                    </div>
                    {round.status === 'ended' && round.penalties.length > 0 ? (
                      <p className="mt-0.5 text-xs text-muted">
                        {round.penalties
                          .map((penalty) =>
                            format(d.monitor.penaltyLine, {
                              name: nameOf(penalty.userId),
                              factor: penalty.factor,
                            }),
                          )
                          .join(' · ')}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <RoundLog
            actions={snapshot.actions}
            members={snapshot.members}
            scale="board"
            gameType={snapshot.room.gameType}
          />
        </aside>
      </div>
    </main>
  )
}

function useFullscreen(): {
  fullscreenSupported: boolean
  isFullscreen: boolean
  toggleFullscreen: () => void
} {
  const [fullscreenSupported, setFullscreenSupported] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    setFullscreenSupported(typeof document.documentElement.requestFullscreen === 'function')
    const onChange = () => setIsFullscreen(document.fullscreenElement !== null)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {})
    } else {
      void document.documentElement.requestFullscreen().catch(() => {})
    }
  }, [])

  return { fullscreenSupported, isFullscreen, toggleFullscreen }
}
