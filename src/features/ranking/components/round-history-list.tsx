'use client'

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
import { format, useDict } from '@/lib/i18n/client'

/** 모바일 한 줄 높이(px) — `h-16` + `space-y-2` 간격 */
const ROW_H = 72

export interface RoundHistoryListRow {
  readonly seq: number
  readonly winnerName: string | null
  readonly pot: number
  readonly note: string | null
  readonly status: 'ended' | 'voided'
  /** 서버에서 미리 합쳐 둔 벌칙(박) 문구. 없으면 null */
  readonly penaltyText: string | null
}

/** 판 기록. 방이 오래 진행될수록 무한히 길어지는 목록이라 스크롤 대신 페이지로 넘긴다. */
export function RoundHistoryList({ rounds }: { rounds: readonly RoundHistoryListRow[] }) {
  const { d } = useDict()
  const isDesktop = useIsDesktop()
  const paged = usePagedRows({
    items: rounds,
    rowHeight: isDesktop ? DATA_TABLE_ROW_H : ROW_H,
    reserve: isDesktop ? DATA_TABLE_HEADER_H : 0,
  })
  const listAria = format(d.result.roundHistoryCount, { n: rounds.length })

  function headText(round: RoundHistoryListRow): string {
    return round.status === 'voided' ? d.result.voided : (round.winnerName ?? '?')
  }

  function detailText(round: RoundHistoryListRow): string {
    return [round.note, round.penaltyText].filter(Boolean).join(' · ')
  }

  function resultCell(round: RoundHistoryListRow) {
    const detail = detailText(round)
    return (
      <span className="truncate">
        <span className="font-bold">{headText(round)}</span>
        {detail ? <span className="text-muted"> · {detail}</span> : null}
      </span>
    )
  }

  function potNode(round: RoundHistoryListRow) {
    return round.status === 'ended' ? (
      <span className="font-black tabular-nums text-warn">+{round.pot.toLocaleString()}</span>
    ) : (
      <Badge tone="muted">{d.result.rematch}</Badge>
    )
  }

  if (rounds.length === 0) {
    return (
      <Panel className="flex min-h-0 flex-1 flex-col">
        <EmptyState title={d.result.noRecords} />
      </Panel>
    )
  }

  return (
    <Panel className="flex min-h-0 flex-1 flex-col gap-2">
      <div ref={paged.areaRef} className="min-h-0 flex-1 overflow-hidden">
        <div className="hidden lg:block">
          <DataTable
            label={listAria}
            columns={[
              {
                key: 'seq',
                header: d.result.colRound,
                width: '4rem',
                align: 'center',
                cellClassName: 'font-bold tabular-nums text-muted',
                cell: (round: RoundHistoryListRow) => `#${round.seq}`,
              },
              {
                key: 'result',
                header: d.result.colResult,
                noTruncate: true,
                cell: resultCell,
              },
              {
                key: 'pot',
                header: d.result.colPot,
                width: '7rem',
                align: 'end',
                noTruncate: true,
                cell: potNode,
              },
            ]}
            rows={paged.rows}
            rowKey={(round) => String(round.seq)}
          />
        </div>
        <ul className="space-y-2 lg:hidden" aria-label={listAria}>
          {paged.rows.map((round) => {
            const detail = detailText(round)
            return (
              <li
                key={round.seq}
                className="flex h-16 items-center justify-between gap-3 rounded-xl bg-bg-deep/60 px-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">
                    <span className="text-muted">#{round.seq}</span>{' '}
                    <span className="font-bold">{headText(round)}</span>
                  </p>
                  {detail ? <p className="truncate text-xs text-muted">{detail}</p> : null}
                </div>
                <div className="shrink-0">{potNode(round)}</div>
              </li>
            )
          })}
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
