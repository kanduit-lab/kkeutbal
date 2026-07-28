'use client'

import Link from 'next/link'
import { Badge, Button, ButtonLink } from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'
import type { RoomSnapshot } from '../types'

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
      <div className="ms-auto flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onToggleMute}
          aria-pressed={muted}
          aria-label={muted ? d.room.soundOnAria : d.room.soundOffAria}
          suppressHydrationWarning
        >
          {muted ? '🔇' : '🔊'}
        </Button>
        <ButtonLink
          href={`/rooms/${snapshot.room.code}/result`}
          variant="outline"
          size="icon"
          aria-label={d.room.resultAria}
          title={d.room.resultAria}
        >
          🧾
        </ButtonLink>
        <ButtonLink
          href={`/rooms/${snapshot.room.code}/monitor`}
          variant="outline"
          size="icon"
          aria-label={d.room.monitorAria}
          title={d.room.monitorTitle}
        >
          📺
        </ButtonLink>
        {isHost ? (
          <ButtonLink
            href={`/rooms/${snapshot.room.code}/settings`}
            variant="outline"
            size="icon"
            aria-label={d.room.settingsAria}
            title={d.room.settingsTitle}
          >
            ⚙️
          </ButtonLink>
        ) : null}
      </div>
    </header>
  )
}