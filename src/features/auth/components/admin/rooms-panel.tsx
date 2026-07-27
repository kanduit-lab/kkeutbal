'use client'

import { useState, useTransition } from 'react'
import { Badge, Button, ConfirmDialog, EmptyState, Panel, useToast } from '@/components/ui'
import { GAME_BADGE_TONE } from '@/features/game/components/shared'
import { format, translateError, useDict } from '@/lib/i18n/client'
import { adminCloseRoom } from '../../admin-actions'
import type { AdminRoomView } from '../../admin-queries'
import { formatAge } from './format'

/**
 * 진행 중인 방 목록과 강제 정산. 확인 다이얼로그는 반드시 대상 방을 이름으로 짚는다 —
 * 목록의 위험 버튼들이 8px 간격으로 붙어 있어 오탭이 쉽고, 잘못 누른 정산은
 * 그 방 참가자 전원의 진행 중인 판을 무효로 만든다.
 */
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

  return (
    <Panel className="space-y-3">
      <h2 className="font-bold">{d.adminConsole.rooms.title}</h2>
      {rooms.length === 0 ? (
        <EmptyState title={d.adminConsole.rooms.empty} hint={d.adminConsole.rooms.emptyHint} />
      ) : (
        <ul className="space-y-2">
          {rooms.map((room) => (
            <li
              key={room.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-bg-deep/60 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-bold">
                  <span className="font-mono tracking-widest">{room.code}</span>
                  <span className="truncate">{room.name}</span>
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
              <Button
                size="sm"
                variant="danger"
                loading={isPending}
                onClick={() => setCloseTarget(room)}
              >
                {d.adminConsole.rooms.close}
              </Button>
            </li>
          ))}
        </ul>
      )}

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
          startTransition(async () => {
            const result = await adminCloseRoom(target.id)
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
