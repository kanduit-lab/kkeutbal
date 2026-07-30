'use client'

import Link from 'next/link'
import type { Route } from 'next'
import {
  Badge,
  DataTable,
  DATA_TABLE_HEADER_H,
  DATA_TABLE_ROW_H,
  Pager,
  Panel,
  usePagedRows,
  useIsDesktop,
} from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'

/** 모바일 한 줄 높이(px) — `h-16` + `space-y-2` 간격 */
const ROW_H = 72

export interface RankingBoardRow {
  readonly rank: number
  readonly userId: string
  readonly displayName: string
  readonly sessions: number
  readonly wins: number
  readonly net: number
}

function rankMark(rank: number): string {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : String(rank)
}

function netClass(net: number): string {
  return net > 0 ? 'text-win' : net < 0 ? 'text-accent' : 'text-muted'
}

function signedNet(net: number): string {
  return `${net > 0 ? '+' : ''}${net.toLocaleString()}`
}

function winRate(row: RankingBoardRow): string {
  if (row.sessions === 0) return '—'
  return `${Math.round((row.wins / row.sessions) * 100)}%`
}

/** 순위표. 데스크톱은 표, 모바일은 카드 — 어느 쪽도 스크롤 없이 페이지로 넘긴다. */
export function RankingBoard({
  rows,
  myId,
  myRowBelowCut,
}: {
  rows: readonly RankingBoardRow[]
  myId: string
  myRowBelowCut?: RankingBoardRow
}) {
  const { d } = useDict()
  const isDesktop = useIsDesktop()
  const paged = usePagedRows({
    items: rows,
    rowHeight: isDesktop ? DATA_TABLE_ROW_H : ROW_H,
    reserve: isDesktop ? DATA_TABLE_HEADER_H : 0,
  })

  function nameCell(row: RankingBoardRow) {
    return (
      <Link
        href={`/ranking/player/${row.userId}` as Route}
        className="flex items-center gap-1.5 hover:underline"
      >
        <span className="truncate font-bold">{row.displayName}</span>
        {row.userId === myId ? <Badge tone="warn">{d.common.me}</Badge> : null}
      </Link>
    )
  }

  return (
    <>
      <Panel className="flex min-h-0 flex-1 flex-col gap-2">
        <div ref={paged.areaRef} className="min-h-0 flex-1 overflow-hidden">
          <div className="hidden lg:block">
            <DataTable
              label={d.ranking.listAria}
              columns={[
                {
                  key: 'rank',
                  header: d.ranking.colRank,
                  width: '4rem',
                  align: 'center',
                  cellClassName: 'text-lg font-black text-muted',
                  cell: (row: RankingBoardRow) => rankMark(row.rank),
                },
                { key: 'player', header: d.ranking.colPlayer, cell: nameCell },
                {
                  key: 'sessions',
                  header: d.ranking.colSessions,
                  width: '5.5rem',
                  align: 'end',
                  cellClassName: 'tabular-nums text-muted',
                  cell: (row: RankingBoardRow) => row.sessions,
                },
                {
                  key: 'wins',
                  header: d.ranking.colWins,
                  width: '5.5rem',
                  align: 'end',
                  cellClassName: 'tabular-nums text-muted',
                  cell: (row: RankingBoardRow) => row.wins,
                },
                {
                  key: 'rate',
                  header: d.ranking.colWinRate,
                  width: '5.5rem',
                  align: 'end',
                  cellClassName: 'tabular-nums text-muted',
                  cell: winRate,
                },
                {
                  key: 'net',
                  header: format(d.ranking.colNet, { unit: d.ranking.netUnit }),
                  width: '9rem',
                  align: 'end',
                  cell: (row: RankingBoardRow) => (
                    <span className={`text-lg font-black tabular-nums ${netClass(row.net)}`}>
                      {signedNet(row.net)}
                    </span>
                  ),
                },
              ]}
              rows={paged.rows}
              rowKey={(row) => row.userId}
              rowHighlight={(row) => row.userId === myId}
            />
          </div>
          <ul className="space-y-2 lg:hidden" aria-label={d.ranking.listAria}>
            {paged.rows.map((row) => (
              <li key={row.userId}>
                <Link href={`/ranking/player/${row.userId}` as Route} className="block">
                  <div
                    className={`flex h-16 items-center gap-3 rounded-xl px-3 ${
                      row.userId === myId
                        ? 'bg-gold/10 ring-1 ring-inset ring-gold/25'
                        : 'bg-bg-deep/60'
                    }`}
                  >
                    <span className="w-7 shrink-0 text-center text-lg font-black text-muted">
                      {rankMark(row.rank)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5">
                        <span className="truncate font-bold">{row.displayName}</span>
                        {row.userId === myId ? <Badge tone="warn">{d.common.me}</Badge> : null}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {format(d.ranking.sessionsAndWins, {
                          sessions: row.sessions,
                          wins: row.wins,
                        })}
                      </p>
                    </div>
                    <p className={`shrink-0 text-lg font-black tabular-nums ${netClass(row.net)}`}>
                      {signedNet(row.net)}
                      <span className="ml-1 text-xs font-bold text-muted">{d.ranking.netUnit}</span>
                    </p>
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
      {myRowBelowCut ? (
        <section
          aria-label={d.ranking.myPositionAria}
          className="shrink-0 rounded-xl bg-gold/10 px-3 py-2 ring-1 ring-inset ring-gold/25"
        >
          <p className="flex items-center gap-2 text-sm">
            <span className="font-black tabular-nums text-muted">{myRowBelowCut.rank}</span>
            <span className="truncate font-bold">{myRowBelowCut.displayName}</span>
            <Badge tone="warn">{d.common.me}</Badge>
            <span className={`ms-auto font-black tabular-nums ${netClass(myRowBelowCut.net)}`}>
              {signedNet(myRowBelowCut.net)}
              <span className="ml-1 text-xs font-bold text-muted">{d.ranking.netUnit}</span>
            </span>
          </p>
        </section>
      ) : null}
    </>
  )
}
