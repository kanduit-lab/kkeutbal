'use client'

import Link from 'next/link'
import { useCallback } from 'react'
import type { EventName } from '@/lib/realtime/events'
import { playChip, playRoundStart, playWin } from '@/lib/sound'
import type { RoomSnapshot } from '../types'
import { Badge } from '@/components/ui'
import { useRoomSync } from './use-room-sync'
import { GameTable } from './game-table'
import { RoundLog } from './round-log'
import { GAME_LABELS } from './shared'

/** 읽기 전용 전광판 — 조작 없이 테이블·팟·기록만 크게. */
export function MonitorClient({
  initial,
  selfId,
}: {
  initial: RoomSnapshot
  selfId: string
}) {
  const onEvent = useCallback((name: EventName, payload: unknown) => {
    if (name === 'bet.placed') {
      const placed = payload as { amount: number }
      if (placed.amount > 0) playChip()
    }
    if (name === 'round.started') playRoundStart()
    if (name === 'round.ended') playWin()
  }, [])

  const { snapshot, online, connected, everConnected, reconnect } = useRoomSync({
    initial,
    selfId,
    onEvent,
  })
  const showDisconnected = everConnected && !connected

  const winnerName = snapshot.lastResult
    ? (snapshot.members.find((m) => m.userId === snapshot.lastResult?.winnerId)?.displayName ??
      '무효')
    : null

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-4 py-4 lg:px-8">
      <header className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/rooms/${snapshot.room.code}`}
            className="text-xl text-muted transition-colors hover:text-text"
            title="방으로 돌아가기"
          >
            ←
          </Link>
          <h1 className="font-brush text-2xl font-bold lg:text-4xl">{snapshot.room.name}</h1>
          <Badge tone="accent">{GAME_LABELS[snapshot.room.gameType].name}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {showDisconnected ? (
            <button
              type="button"
              onClick={reconnect}
              className="rounded-md bg-warn/20 px-2 py-1 text-xs font-bold text-warn"
            >
              연결 끊김 · 다시 연결
            </button>
          ) : null}
          <span className="font-mono text-2xl font-black tracking-[0.3em] text-muted lg:text-3xl">
            {snapshot.room.code}
          </span>
          <Badge tone={snapshot.currentRound ? 'win' : 'muted'}>
            {snapshot.currentRound ? `${snapshot.currentRound.seq}판` : '대기'}
          </Badge>
        </div>
      </header>

      {snapshot.lastResult && !snapshot.currentRound ? (
        <p className="mb-1 text-center text-sm text-muted lg:text-lg">
          지난 {snapshot.lastResult.seq}판 · {winnerName} +
          {snapshot.lastResult.pot.toLocaleString()}
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
          />
        </div>
        <aside className="w-full shrink-0 lg:w-80">
          <RoundLog actions={snapshot.actions} members={snapshot.members} />
        </aside>
      </div>
    </main>
  )
}
