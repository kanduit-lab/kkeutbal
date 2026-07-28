'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'
import type { RoomSnapshot } from '../types'

const ICON_LINK_CLASS =
  'inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-lg leading-none transition-colors hover:border-gold/40 hover:bg-white/10'

export function RoomHeader({
  snapshot,
  isHost,
  muted,
  onToggleMute,
}: {
  snapshot: RoomSnapshot
  isHost: boolean
  muted: boolean
  onToggleMute: () => void
}) {
  const { d } = useDict()
  return (
    <header className="rise-in mb-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 lg:mb-8">
      <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
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
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted lg:text-sm">
            <span>
              {d.room.codeLabel}{' '}
              <span className="font-mono font-bold tracking-widest">{snapshot.room.code}</span>
              {' · '}
              {d.games[snapshot.room.gameType]}
              {' · '}
              {snapshot.room.inputMode === 'trust' ? d.inputMode.trust : d.inputMode.approval}
            </span>
            <Badge tone={snapshot.currentRound ? 'win' : 'muted'}>
              {snapshot.currentRound
                ? format(d.room.roundLive, { seq: snapshot.currentRound.seq })
                : d.common.waiting}
            </Badge>
          </div>
        </div>
      </div>
      <div className="ms-auto flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onToggleMute}
          aria-pressed={muted}
          aria-label={muted ? d.room.soundOnAria : d.room.soundOffAria}
          suppressHydrationWarning
          className={ICON_LINK_CLASS}
        >
          {muted ? '🔇' : '🔊'}
        </button>
        <Link
          href={`/rooms/${snapshot.room.code}/result`}
          aria-label={d.room.resultAria}
          title={d.room.resultAria}
          className={ICON_LINK_CLASS}
        >
          🧾
        </Link>
        <Link
          href={`/rooms/${snapshot.room.code}/monitor`}
          aria-label={d.room.monitorAria}
          title={d.room.monitorTitle}
          className={ICON_LINK_CLASS}
        >
          📺
        </Link>
        {isHost ? (
          <Link
            href={`/rooms/${snapshot.room.code}/settings`}
            aria-label={d.room.settingsAria}
            title={d.room.settingsTitle}
            className={ICON_LINK_CLASS}
          >
            ⚙️
          </Link>
        ) : null}
      </div>
    </header>
  )
}