'use client'

import { Button } from '@/components/ui'
import { useDict } from '@/lib/i18n/client'

export function RoomConnectionBar({
  syncFailed,
  disconnected,
  onReconnect,
}: {
  syncFailed: boolean
  disconnected: boolean
  onReconnect: () => void
}) {
  const { d } = useDict()
  const visible = syncFailed || disconnected
  return (
    <div role="status" aria-live="polite" className={visible ? 'mb-3' : undefined}>
      {visible ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold/30 bg-gold/10 px-4 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-bold text-warn">
              {syncFailed ? d.room.syncFailedTitle : d.room.disconnectedTitle}
            </p>
            <p className="text-micro text-muted">{d.room.staleBody}</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="surface"
            className="shrink-0"
            onClick={onReconnect}
          >
            {d.room.reconnect}
          </Button>
        </div>
      ) : null}
    </div>
  )
}