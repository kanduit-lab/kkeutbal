'use client'

import Link from 'next/link'
import type { Route } from 'next'
import {
  Badge,
  EmptyState,
  PaneGroup,
  Pager,
  Panel,
  PanelHeader,
  usePagedRows,
} from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'
import type { Locale } from '@/lib/i18n/config'
import { GAME_BADGE_TONE } from '../labels'
import type { RoomGameType } from '../types'

/** 한 줄 높이(px) — `h-16` + `space-y-2` 간격 */
const ROW_H = 72

export interface HomeRoomRow {
  readonly code: string
  readonly name: string
  readonly memberCount: number
  readonly gameType: RoomGameType
  readonly status: string
}

export interface HomeSessionRow {
  readonly id: string
  readonly code: string
  readonly name: string
  readonly gameType: RoomGameType
  readonly closedAt: string | null
  readonly myNet: number
}

function sessionDate(iso: string | null, locale: Locale): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-US', {
    month: 'short',
    day: 'numeric',
  })
}

/** 참여 중인 방과 지난 세션. 데스크톱은 위아래로, 모바일은 탭으로 나눠 스크롤을 없앤다. */
export function HomeLists({
  rooms,
  sessions,
}: {
  rooms: readonly HomeRoomRow[]
  sessions: readonly HomeSessionRow[]
}) {
  const { d, locale } = useDict()
  const pagedRooms = usePagedRows({ items: rooms, rowHeight: ROW_H })
  const pagedSessions = usePagedRows({ items: sessions, rowHeight: ROW_H })

  return (
    <PaneGroup
      ariaLabel={d.home.listNavLabel}
      columns="lg:grid-cols-1 lg:grid-rows-2"
      panes={[
        {
          key: 'rooms',
          label: d.home.activeRooms,
          node: (
            <Panel className="flex min-h-0 flex-1 flex-col gap-2">
              <PanelHeader
                title={d.home.activeRooms}
                badge={<Badge tone="muted">{format(d.common.itemCount, { n: rooms.length })}</Badge>}
              />
              <div ref={pagedRooms.areaRef} className="min-h-0 flex-1 overflow-hidden">
                {rooms.length === 0 ? (
                  <EmptyState title={d.home.emptyTitle} hint={d.home.emptyHint} />
                ) : (
                  <ul className="space-y-2" aria-label={d.home.activeRooms}>
                    {pagedRooms.rows.map((room) => (
                      <li key={room.code}>
                        <Link href={`/rooms/${room.code}` as Route} className="block">
                          <div className="flex h-16 items-center justify-between gap-3 rounded-xl bg-inset px-3 transition-transform hover:-translate-y-0.5">
                            <div className="min-w-0">
                              <p className="truncate font-bold">{room.name}</p>
                              <p className="mt-0.5 truncate text-sm text-muted">
                                <span className="font-mono tracking-widest">{room.code}</span> ·{' '}
                                {format(d.home.memberCount, { n: room.memberCount })}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <Badge tone={GAME_BADGE_TONE[room.gameType]}>
                                {d.games[room.gameType]}
                              </Badge>
                              <Badge tone={room.status === 'playing' ? 'win' : 'muted'}>
                                {room.status === 'playing' ? d.common.playing : d.common.waiting}
                              </Badge>
                            </div>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {rooms.length > 0 ? (
                <Pager
                  page={pagedRooms.page}
                  pageCount={pagedRooms.pageCount}
                  from={pagedRooms.from}
                  to={pagedRooms.to}
                  total={pagedRooms.total}
                  onPage={pagedRooms.setPage}
                />
              ) : null}
            </Panel>
          ),
        },
        {
          key: 'sessions',
          label: d.home.recentSessions,
          node: (
            <Panel className="flex min-h-0 flex-1 flex-col gap-2">
              <PanelHeader
                title={d.home.recentSessions}
                badge={
                  <Badge tone="muted">{format(d.common.itemCount, { n: sessions.length })}</Badge>
                }
              />
              <div ref={pagedSessions.areaRef} className="min-h-0 flex-1 overflow-hidden">
                {sessions.length === 0 ? (
                  <EmptyState title={d.home.recentEmptyTitle} hint={d.home.recentEmptyHint} />
                ) : (
                  <ul className="space-y-2" aria-label={d.home.recentSessions}>
                    {pagedSessions.rows.map((past) => (
                      <li key={past.id}>
                        <Link href={`/rooms/${past.code}/result` as Route} className="block">
                          <div className="flex h-16 items-center justify-between gap-3 rounded-xl bg-inset px-3 transition-transform hover:-translate-y-0.5">
                            <div className="min-w-0">
                              <p className="flex items-center gap-1.5">
                                <span className="truncate font-bold">{past.name}</span>
                                <Badge tone={GAME_BADGE_TONE[past.gameType]}>
                                  {d.games[past.gameType]}
                                </Badge>
                              </p>
                              <p className="mt-0.5 text-sm text-muted">
                                {sessionDate(past.closedAt, locale)}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 font-black tabular-nums ${
                                past.myNet > 0
                                  ? 'text-win'
                                  : past.myNet < 0
                                    ? 'text-accent'
                                    : 'text-muted'
                              }`}
                            >
                              {past.myNet > 0 ? '+' : ''}
                              {past.myNet.toLocaleString()}
                              <span className="ml-1 text-xs font-bold text-muted">
                                {d.home.netUnit}
                              </span>
                            </span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {sessions.length > 0 ? (
                <Pager
                  page={pagedSessions.page}
                  pageCount={pagedSessions.pageCount}
                  from={pagedSessions.from}
                  to={pagedSessions.to}
                  total={pagedSessions.total}
                  onPage={pagedSessions.setPage}
                />
              ) : null}
            </Panel>
          ),
        },
      ]}
    />
  )
}
