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

export function MonitorClient({ initial, selfId }: { initial: RoomSnapshot; selfId: string }) {
  const { d } = useDict()

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
    refetch,
    reconnect,
  } = useRoomSync({ initial, selfId, spectator: true, onEvent })

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
      className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-4 lg:min-h-0 lg:overflow-hidden lg:px-8"
    >
      <div className="lg:shrink-0">
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
        <p className="mb-1 text-center text-sm text-muted lg:shrink-0 lg:text-lg">
          {format(d.monitor.lastRoundSummary, {
            seq: snapshot.lastResult.seq,
            name: winnerName ?? '?',
            pot: snapshot.lastResult.pot.toLocaleString(),
          })}
          {snapshot.lastResult.note ? ` · ${snapshot.lastResult.note}` : ''}
        </p>
      ) : null}

      <div className="flex flex-1 flex-col gap-4 lg:min-h-0 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 pt-6 lg:flex lg:min-h-0 lg:items-center lg:justify-center lg:pt-0">
          <GameTable
            members={snapshot.members}
            online={online}
            selfId={selfId}
            pot={snapshot.currentRound?.pot ?? 0}
            actions={snapshot.actions}
            winnerId={snapshot.currentRound ? null : (snapshot.lastResult?.winnerId ?? null)}
            scale="board"
            gameType={snapshot.room.gameType}
            fit
          />
        </div>
        <aside className="w-full shrink-0 lg:flex lg:h-full lg:w-80 lg:flex-col lg:overflow-y-auto lg:overscroll-contain">
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
