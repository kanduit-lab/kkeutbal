'use client'

import {
  DataTable,
  DATA_TABLE_HEADER_H,
  DATA_TABLE_ROW_H,
  Pager,
  Panel,
  usePagedRows,
  useIsDesktop,
} from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'
import type { StandingRow } from '../queries'

/** 모바일 한 줄 높이(px) — `h-16` + `space-y-2` 간격 */
const ROW_H = 72

export interface RoomStandingRow extends StandingRow {
  readonly rank: number
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

/**
 * 세션 참가자 순위. 표시 항목은 원래 화면과 동일하다 — 순위, 이름, 승/바이인/잔액 요약, 순손익.
 * 데스크톱은 표, 모바일은 카드, 어느 쪽도 스크롤 없이 페이지로 넘긴다.
 */
export function RoomStandingsList({ rows }: { rows: readonly RoomStandingRow[] }) {
  const { d } = useDict()
  const isDesktop = useIsDesktop()
  const paged = usePagedRows({
    items: rows,
    rowHeight: isDesktop ? DATA_TABLE_ROW_H : ROW_H,
    reserve: isDesktop ? DATA_TABLE_HEADER_H : 0,
  })

  function statLine(row: RoomStandingRow): string {
    return format(d.result.statLine, {
      wins: row.wins,
      buyIn: row.buyInTotal.toLocaleString(),
      balance: row.balance.toLocaleString(),
    })
  }

  function nameCell(row: RoomStandingRow) {
    return (
      <span className="truncate">
        <span className="font-bold">{row.displayName}</span>{' '}
        <span className="text-xs text-muted">{statLine(row)}</span>
      </span>
    )
  }

  return (
    <Panel className="flex min-h-0 flex-1 flex-col gap-2">
      <div ref={paged.areaRef} className="min-h-0 flex-1 overflow-hidden">
        <div className="hidden lg:block">
          <DataTable
            label={d.result.standingsAria}
            columns={[
              {
                key: 'rank',
                header: d.ranking.colRank,
                width: '3.5rem',
                align: 'center',
                cellClassName: 'text-lg font-black text-muted',
                cell: (row: RoomStandingRow) => rankMark(row.rank),
              },
              { key: 'player', header: d.ranking.colPlayer, cell: nameCell },
              {
                key: 'net',
                header: format(d.ranking.colNet, { unit: d.ranking.netUnit }),
                width: '9rem',
                align: 'end',
                cell: (row: RoomStandingRow) => (
                  <span className={`text-lg font-black tabular-nums ${netClass(row.net)}`}>
                    {signedNet(row.net)}
                  </span>
                ),
              },
            ]}
            rows={paged.rows}
            rowKey={(row) => row.userId}
          />
        </div>
        <ul className="space-y-2 lg:hidden" aria-label={d.result.standingsAria}>
          {paged.rows.map((row) => (
            <li
              key={row.userId}
              className="flex h-16 items-center gap-3 rounded-xl bg-bg-deep/60 px-3"
            >
              <span className="w-7 shrink-0 text-center text-lg font-black text-muted">
                {rankMark(row.rank)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{row.displayName}</p>
                <p className="truncate text-xs text-muted">{statLine(row)}</p>
              </div>
              <p className={`shrink-0 text-lg font-black tabular-nums ${netClass(row.net)}`}>
                {signedNet(row.net)}
              </p>
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
