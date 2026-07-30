'use client'

import Link from 'next/link'
import type { Route } from 'next'
import {
  Badge,
  DataTable,
  DATA_TABLE_HEADER_H,
  DATA_TABLE_ROW_H,
  EmptyState,
  Pager,
  Panel,
  usePagedRows,
  useIsDesktop,
} from '@/components/ui'
import { useDict } from '@/lib/i18n/client'
import type { Locale } from '@/lib/i18n/config'
import { GAME_BADGE_TONE } from '@/features/game/labels'
import type { PlayerRecentSession } from '../queries'

/** 모바일 한 줄 높이(px) — `h-16` + `space-y-2` 간격 */
const ROW_H = 72

function netClass(net: number): string {
  return net > 0 ? 'text-win' : net < 0 ? 'text-accent' : 'text-muted'
}

function netLabel(net: number): string {
  return `${net > 0 ? '+' : ''}${net.toLocaleString()}`
}

function formatSessionDate(iso: string | null, locale: Locale): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-US', {
    month: 'short',
    day: 'numeric',
  })
}

/** 최근 세션 목록. 오래 활동할수록 늘어나는 목록이라 스크롤 대신 페이지로 넘긴다. */
export function PlayerRecentSessionsList({
  sessions,
}: {
  sessions: readonly PlayerRecentSession[]
}) {
  const { d, locale } = useDict()
  const isDesktop = useIsDesktop()
  const paged = usePagedRows({
    items: sessions,
    rowHeight: isDesktop ? DATA_TABLE_ROW_H : ROW_H,
    reserve: isDesktop ? DATA_TABLE_HEADER_H : 0,
  })

  function roomCell(session: PlayerRecentSession) {
    return (
      <Link
        href={`/rooms/${session.code}/result` as Route}
        className="flex min-w-0 items-center gap-2 hover:underline"
      >
        <span className="truncate font-bold">{session.name}</span>
        <Badge tone={GAME_BADGE_TONE[session.gameType]}>{d.games[session.gameType]}</Badge>
      </Link>
    )
  }

  if (sessions.length === 0) {
    return (
      <Panel className="flex min-h-0 flex-1 flex-col">
        <EmptyState title={d.ranking.emptyTitle} hint={d.ranking.playerEmptyHint} />
      </Panel>
    )
  }

  return (
    <Panel className="flex min-h-0 flex-1 flex-col gap-2">
      <div ref={paged.areaRef} className="min-h-0 flex-1 overflow-hidden">
        <div className="hidden lg:block">
          <DataTable
            label={d.ranking.recentSessionsTitle}
            columns={[
              { key: 'room', header: d.roomForm.nameLabel, noTruncate: true, cell: roomCell },
              {
                key: 'when',
                header: d.wallet.colWhen,
                width: '7rem',
                cellClassName: 'text-muted tabular-nums',
                cell: (session: PlayerRecentSession) => formatSessionDate(session.closedAt, locale),
              },
              {
                key: 'net',
                header: d.ranking.statNet,
                width: '8rem',
                align: 'end',
                cell: (session: PlayerRecentSession) => (
                  <span className={`font-black tabular-nums ${netClass(session.myNet)}`}>
                    {netLabel(session.myNet)}
                  </span>
                ),
              },
            ]}
            rows={paged.rows}
            rowKey={(session) => session.id}
          />
        </div>
        <ul className="space-y-2 lg:hidden" aria-label={d.ranking.recentSessionsTitle}>
          {paged.rows.map((session) => (
            <li key={session.id}>
              <Link href={`/rooms/${session.code}/result` as Route} className="block">
                <div className="flex h-16 items-center justify-between gap-3 rounded-xl bg-bg-deep/60 px-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate font-bold">{session.name}</p>
                    <Badge tone={GAME_BADGE_TONE[session.gameType]}>
                      {d.games[session.gameType]}
                    </Badge>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-muted">
                      {formatSessionDate(session.closedAt, locale)}
                    </span>
                    <span className={`font-black tabular-nums ${netClass(session.myNet)}`}>
                      {netLabel(session.myNet)}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <Pager
        page={paged.page}
        pageCount={paged.pageCount}
        from={paged.from}
        to={paged.to}
        total={paged.total}
        onPage={paged.setPage}
      />
    </Panel>
  )
}
