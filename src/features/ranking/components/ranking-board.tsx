'use client'

import Link from 'next/link'
import type { Route } from 'next'
import {
  Avatar,
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

/** 모바일 한 줄 높이(px) — `min-h-16` + `space-y-2` 간격 */
const ROW_H = 72

export interface RankingBoardRow {
  readonly rank: number
  readonly userId: string
  readonly displayName: string
  readonly sessions: number
  readonly wins: number
  readonly net: number
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

export function RankingBoard({
  rows,
  myId,
}: {
  rows: readonly RankingBoardRow[]
  myId: string
}) {
  const { d } = useDict()
  const isDesktop = useIsDesktop()
  const paged = usePagedRows({
    items: rows,
    rowHeight: isDesktop ? DATA_TABLE_ROW_H : ROW_H,
    reserve: isDesktop ? DATA_TABLE_HEADER_H : 0,
  })
  const leader = rows[0]
  const runnersUp = rows.slice(1, 3)
  const myRow = rows.find((row) => row.userId === myId)
  const showMyPosition = myRow && !paged.rows.some((row) => row.userId === myId)

  if (!leader) return null

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
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <section
        aria-label={d.ranking.summaryAria}
        className={
          runnersUp.length > 0
            ? 'grid shrink-0 gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]'
            : 'shrink-0'
        }
      >
        <Panel className="relative overflow-hidden p-4 sm:p-5">
          <div className="absolute inset-y-0 end-0 w-1/3 bg-gold/5" aria-hidden />
          <div className="relative flex items-center gap-3 sm:gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gold/15 text-lg font-black tabular-nums text-gold ring-1 ring-inset ring-gold/30">
              {leader.rank}
            </span>
            <Avatar name={leader.displayName} size={48} />
            <div className="min-w-0 flex-1">
              <p className="text-micro font-bold text-gold">{d.ranking.leaderLabel}</p>
              <Link
                href={`/ranking/player/${leader.userId}` as Route}
                className="mt-0.5 block truncate text-xl font-black hover:underline"
              >
                {leader.displayName}
              </Link>
              <p className="mt-0.5 text-xs text-muted">{d.ranking.leaderDescription}</p>
            </div>
            <p className={`shrink-0 text-2xl font-black tabular-nums ${netClass(leader.net)}`}>
              {signedNet(leader.net)}
              <span className="ms-1 text-xs font-bold text-muted">{d.ranking.netUnit}</span>
            </p>
          </div>
        </Panel>
        {runnersUp.length > 0 ? (
          <Panel className="p-0">
            <p className="px-4 pb-1 pt-3 text-micro font-bold text-muted">{d.ranking.nextRanksLabel}</p>
            <ol className="divide-y divide-white/5" aria-label={d.ranking.nextRanksAria}>
              {runnersUp.map((row) => (
                <li key={row.userId} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-5 text-center text-sm font-black tabular-nums text-muted">
                    {row.rank}
                  </span>
                  <Link
                    href={`/ranking/player/${row.userId}` as Route}
                    className="min-w-0 flex-1 truncate text-sm font-bold hover:underline"
                  >
                    {row.displayName}
                  </Link>
                  {row.userId === myId ? <Badge tone="warn">{d.common.me}</Badge> : null}
                  <span className={`text-sm font-black tabular-nums ${netClass(row.net)}`}>
                    {signedNet(row.net)}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
        ) : null}
      </section>
      <Panel className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-5">
        <div className="shrink-0">
          <h2 className="text-lg font-black">{d.ranking.listTitle}</h2>
          <p className="mt-0.5 text-xs text-muted">
            {format(d.ranking.rankedPlayers, { n: rows.length })}
          </p>
        </div>
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
                  cell: (row: RankingBoardRow) => row.rank,
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
                    className={`flex min-h-16 items-center gap-3 rounded-xl px-3 py-2.5 ${
                      row.userId === myId
                        ? 'bg-gold/10 ring-1 ring-inset ring-gold/25'
                        : 'bg-inset'
                    }`}
                  >
                    <span className="w-7 shrink-0 text-center text-lg font-black tabular-nums text-muted">
                      {row.rank}
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
      {showMyPosition ? (
        <section
          aria-label={d.ranking.myPositionAria}
          className="shrink-0 rounded-xl bg-gold/10 px-3 py-2 ring-1 ring-inset ring-gold/25"
        >
          <p className="flex items-center gap-2 text-sm">
            <span className="font-black tabular-nums text-muted">{myRow.rank}</span>
            <span className="truncate font-bold">{myRow.displayName}</span>
            <Badge tone="warn">{d.common.me}</Badge>
            <span className={`ms-auto font-black tabular-nums ${netClass(myRow.net)}`}>
              {signedNet(myRow.net)}
              <span className="ml-1 text-xs font-bold text-muted">{d.ranking.netUnit}</span>
            </span>
          </p>
        </section>
      ) : null}
    </div>
  )
}
