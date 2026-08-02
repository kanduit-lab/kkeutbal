'use client'

import Link from 'next/link'
import type { Route } from 'next'
import type { ReactNode } from 'react'
import {
  Badge,
  DataTable,
  DATA_TABLE_HEADER_H,
  DATA_TABLE_ROW_H,
  EmptyState,
  listPanelMinHeight,
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

/** 내 프로필에서만 정산표로 링크한다. 남의 프로필에서는 같은 자리에 눌리지 않는 블록을 둔다. */
function MaybeResultLink({
  code,
  enabled,
  children,
}: {
  code: string
  enabled: boolean
  children: ReactNode
}) {
  if (!enabled) return <div className="block">{children}</div>
  return (
    <Link href={`/rooms/${code}/result` as Route} className="block">
      {children}
    </Link>
  )
}

function formatSessionDate(iso: string | null, locale: Locale): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-US', {
    month: 'short',
    day: 'numeric',
  })
}

/**
 * 최근 세션 목록. 오래 활동할수록 늘어나는 목록이라 스크롤 대신 페이지로 넘긴다.
 *
 * `linkToResult`는 "이 목록의 주인이 보는 사람 자신인가"다. 정산표(`/rooms/{code}/result`)는
 * 그 방 참가자만 볼 수 있으므로, 남의 프로필에서 그 링크를 그리면 누를 때마다 거부 화면으로
 * 떨어진다 — 막는 건 맞지만 눌리는 링크로 보여줄 이유는 없다.
 */
export function PlayerRecentSessionsList({
  sessions,
  linkToResult,
}: {
  sessions: readonly PlayerRecentSession[]
  linkToResult: boolean
}) {
  const { d, locale } = useDict()
  const isDesktop = useIsDesktop()
  const rowHeight = isDesktop ? DATA_TABLE_ROW_H : ROW_H
  const reserve = isDesktop ? DATA_TABLE_HEADER_H : 0
  const paged = usePagedRows({ items: sessions, rowHeight, reserve })

  function roomCell(session: PlayerRecentSession) {
    const body = (
      <>
        <span className="truncate font-bold">{session.name}</span>
        <Badge tone={GAME_BADGE_TONE[session.gameType]}>{d.games[session.gameType]}</Badge>
      </>
    )
    if (!linkToResult) return <div className="flex min-w-0 items-center gap-2">{body}</div>
    return (
      <Link
        href={`/rooms/${session.code}/result` as Route}
        className="flex min-w-0 items-center gap-2 hover:underline"
      >
        {body}
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
    <Panel
      className="flex min-h-0 flex-1 flex-col gap-2"
      style={{ minHeight: listPanelMinHeight(rowHeight, reserve) }}
    >
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
              <MaybeResultLink code={session.code} enabled={linkToResult}>
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
              </MaybeResultLink>
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
