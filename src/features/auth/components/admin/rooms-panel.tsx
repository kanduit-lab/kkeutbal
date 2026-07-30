'use client'

import { useState, useTransition } from 'react'
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  DATA_TABLE_HEADER_H,
  DATA_TABLE_ROW_H,
  EmptyState,
  Pager,
  Panel,
  PanelHeader,
  usePagedRows,
  useIsDesktop,
  useToast,
} from '@/components/ui'
import { GAME_BADGE_TONE } from '@/features/game/components/shared'
import { format, translateError, useDict } from '@/lib/i18n/client'
import { adminCloseRoom } from '../../admin-actions'
import type { AdminRoomView } from '../../admin-queries'
import { formatAge } from './format'

/** 모바일 한 줄 높이(px) — `h-16` + `space-y-2` 간격 */
const ROW_H = 72

export function RoomsPanel({
  rooms,
  onDataChanged,
}: {
  rooms: readonly AdminRoomView[]
  onDataChanged: () => void
}) {
  const { d } = useDict()
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [closeTarget, setCloseTarget] = useState<AdminRoomView | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const isDesktop = useIsDesktop()
  const paged = usePagedRows({
    items: rooms,
    rowHeight: isDesktop ? DATA_TABLE_ROW_H : ROW_H,
    reserve: isDesktop ? DATA_TABLE_HEADER_H : 0,
  })

  function closeButton(room: AdminRoomView) {
    return (
      <Button
        size="sm"
        variant="danger"
        loading={isPending && pendingId === room.id}
        onClick={() => setCloseTarget(room)}
      >
        {d.adminConsole.rooms.close}
      </Button>
    )
  }

  return (
    <Panel className="flex min-h-0 flex-1 flex-col gap-3">
      <PanelHeader
        title={d.adminConsole.rooms.title}
        badge={<Badge tone="muted">{format(d.common.itemCount, { n: rooms.length })}</Badge>}
      />
      <div ref={paged.areaRef} className="min-h-0 flex-1 overflow-hidden">
        {rooms.length === 0 ? (
          <EmptyState title={d.adminConsole.rooms.empty} hint={d.adminConsole.rooms.emptyHint} />
        ) : (
          <>
            <div className="hidden lg:block">
              <DataTable
                label={d.adminConsole.rooms.title}
                columns={[
                  {
                    key: 'room',
                    header: d.adminConsole.rooms.colRoom,
                    cell: (room: AdminRoomView) => (
                      <span className="flex items-center gap-1.5">
                        <span className="shrink-0 font-mono tracking-widest">{room.code}</span>
                        <span className="truncate font-bold">{room.name}</span>
                        <Badge tone={GAME_BADGE_TONE[room.gameType]}>
                          {d.games[room.gameType]}
                        </Badge>
                      </span>
                    ),
                  },
                  {
                    key: 'host',
                    header: d.adminConsole.rooms.colHost,
                    width: '8rem',
                    cellClassName: 'text-muted',
                    cell: (room: AdminRoomView) => room.hostName,
                  },
                  {
                    key: 'members',
                    header: d.adminConsole.rooms.colMembers,
                    width: '5rem',
                    align: 'end',
                    cellClassName: 'tabular-nums text-muted',
                    cell: (room: AdminRoomView) => room.memberCount,
                  },
                  {
                    key: 'age',
                    header: d.adminConsole.rooms.colAge,
                    width: '7rem',
                    cellClassName: 'text-muted',
                    cell: (room: AdminRoomView) => formatAge(d, room.createdAt),
                  },
                  {
                    key: 'status',
                    header: d.adminConsole.rooms.colStatus,
                    width: '5.5rem',
                    noTruncate: true,
                    cell: (room: AdminRoomView) => (
                      <Badge tone={room.status === 'playing' ? 'win' : 'muted'}>
                        {room.status === 'playing' ? d.common.playing : d.common.waiting}
                      </Badge>
                    ),
                  },
                  {
                    key: 'action',
                    header: d.adminConsole.rooms.colAction,
                    width: '7rem',
                    align: 'end',
                    noTruncate: true,
                    cell: closeButton,
                  },
                ]}
                rows={paged.rows}
                rowKey={(room) => room.id}
              />
            </div>
            <ul className="space-y-2 lg:hidden">
              {paged.rows.map((room) => (
                <li
                  key={room.id}
                  className="flex h-16 items-center justify-between gap-3 rounded-xl bg-bg-deep/60 px-3"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5">
                      <span className="shrink-0 font-mono tracking-widest">{room.code}</span>
                      <span className="truncate font-bold">{room.name}</span>
                      <Badge tone={GAME_BADGE_TONE[room.gameType]}>
                        {d.games[room.gameType]}
                      </Badge>
                    </p>
                    <p className="truncate text-xs text-muted">
                      {format(d.adminConsole.rooms.meta, {
                        host: room.hostName,
                        members: room.memberCount,
                        age: formatAge(d, room.createdAt),
                      })}
                      {room.status === 'playing' ? d.adminConsole.rooms.playingSuffix : ''}
                    </p>
                  </div>
                  <div className="shrink-0">{closeButton(room)}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {rooms.length > 0 ? (
        <Pager
          page={paged.page}
          pageCount={paged.pageCount}
          from={paged.from}
          to={paged.to}
          total={paged.total}
          onPage={paged.setPage}
        />
      ) : null}

      <ConfirmDialog
        open={closeTarget !== null}
        title={format(d.adminConsole.rooms.closeTitle, {
          code: closeTarget?.code ?? '',
          name: closeTarget?.name ?? '',
        })}
        body={format(d.adminConsole.rooms.closeBody, { members: closeTarget?.memberCount ?? 0 })}
        confirmLabel={d.adminConsole.rooms.close}
        tone="danger"
        onConfirm={() => {
          const target = closeTarget
          setCloseTarget(null)
          if (!target) return
          setPendingId(target.id)
          startTransition(async () => {
            const result = await adminCloseRoom(target.id)
            setPendingId(null)
            if (result.success) {
              toast(d.adminConsole.rooms.closedToast, 'success')
              onDataChanged()
            } else {
              toast(translateError(d, result.error), 'error')
            }
          })
        }}
        onClose={() => setCloseTarget(null)}
      />
    </Panel>
  )
}
