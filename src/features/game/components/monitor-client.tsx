'use client'

import Link from 'next/link'
import { clsx } from 'clsx'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, useDict } from '@/lib/i18n/client'
import type { RoomEvent } from '@/lib/realtime/events'
import { playChip, playRoundStart, playWin } from '@/lib/sound'
import type { MemberView, RoomSnapshot } from '../types'
import { Badge } from '@/components/ui'
import { useRoomSync } from './use-room-sync'
import { useWakeLock } from './use-wake-lock'
import { RoomConnectionBar } from './room-connection-bar'
import { GameTable } from './game-table'
import { RoundLog } from './round-log'

/**
 * 읽기 전용 전광판 — 조작 없이 테이블·팟·기록만 크게. 태블릿·TV 상시 표시 전제.
 * 로그인만 하면 참가자가 아니어도 볼 수 있다(서버 refreshRoom 이 참가 여부를 묻지 않는다) —
 * selfId 가 멤버가 아닐 수 있으므로 멤버 조회는 전부 미존재를 허용해야 한다.
 */
export function MonitorClient({
  initial,
  selfId,
}: {
  initial: RoomSnapshot
  selfId: string
}) {
  const { d } = useDict()
  // 전광판은 계속 켜 두는 화면이다 — 화면 꺼짐을 막는다 (미지원이면 조용히 무시).
  useWakeLock()

  const onEvent = useCallback((event: RoomEvent) => {
    if (event.name === 'bet.placed' && event.payload.amount > 0) playChip()
    if (event.name === 'round.started') playRoundStart()
    if (event.name === 'round.ended') playWin()
  }, [])

  // spectator — 전광판 기기가 접속자·좌석 온라인으로 잡히면 안 된다 (presence track 생략).
  const {
    snapshot,
    online,
    connected,
    everConnected,
    connectTimedOut,
    syncFailed,
    refetch,
    reconnect,
  } = useRoomSync({ initial, selfId, spectator: true, onEvent })

  const { fullscreenSupported, isFullscreen, toggleFullscreen } = useFullscreen()

  const winnerName = snapshot.lastResult
    ? (snapshot.members.find((m) => m.userId === snapshot.lastResult?.winnerId)?.displayName ??
      '?')
    : null

  const nameOf = (userId: string | null) =>
    userId
      ? (snapshot.members.find((member) => member.userId === userId)?.displayName ?? '?')
      : '?'

  /** 현재 1위 — 관전 제외, 순손익(잔액 − 바이인) 최대. 동률이면 좌석 순 첫 사람. */
  const leader: MemberView | null = useMemo(() => {
    const players = snapshot.members.filter((member) => member.role !== 'observer')
    if (players.length === 0) return null
    return players.reduce((best, member) =>
      member.balance - member.buyInTotal > best.balance - best.buyInTotal ? member : best,
    )
  }, [snapshot.members])
  const leaderNet = leader ? leader.balance - leader.buyInTotal : 0

  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-4 py-4 lg:px-8">
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

      {/* 연결 경고는 헤더 아이콘 줄이 아니라 전용 슬롯에서 알린다 — 소켓이 깜빡일 때마다
          방 코드·뱃지가 밀리면 상시 표시 화면에서 특히 눈에 거슬린다. */}
      <RoomConnectionBar
        syncFailed={syncFailed}
        disconnected={(everConnected && !connected) || connectTimedOut}
        onReconnect={() => {
          // 채널 재구독 + 즉시 refetch — 채널이 멀쩡한데 동기화만 죽은 경우도 복구한다.
          reconnect()
          void refetch()
        }}
      />

      {snapshot.lastResult && !snapshot.currentRound ? (
        <p className="mb-1 text-center text-sm text-muted lg:text-lg">
          {format(d.monitor.lastRoundSummary, {
            seq: snapshot.lastResult.seq,
            name: winnerName ?? '?',
            pot: snapshot.lastResult.pot.toLocaleString(),
          })}
          {snapshot.lastResult.note ? ` · ${snapshot.lastResult.note}` : ''}
        </p>
      ) : null}

      <div className="flex flex-1 flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 pt-6">
          <GameTable
            members={snapshot.members}
            online={online}
            selfId={selfId}
            pot={snapshot.currentRound?.pot ?? 0}
            actions={snapshot.actions}
            winnerId={snapshot.currentRound ? null : (snapshot.lastResult?.winnerId ?? null)}
            scale="board"
            gameType={snapshot.room.gameType}
          />
        </div>
        <aside className="w-full shrink-0 lg:w-80">
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

/**
 * 전체 화면 토글 — Fullscreen API 미지원(iOS Safari 등)이면 supported=false 로 버튼을 숨긴다.
 * ESC·시스템 제스처로 나가는 경우까지 fullscreenchange 로 상태를 맞춘다.
 */
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
    // 전환 거부(권한·제스처 정책)는 조용히 무시 — 전광판 표시 자체에는 영향이 없다.
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {})
    } else {
      void document.documentElement.requestFullscreen().catch(() => {})
    }
  }, [])

  return { fullscreenSupported, isFullscreen, toggleFullscreen }
}
