'use client'

import {
  Alert,
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
import { format, useDict } from '@/lib/i18n/client'

/** 모바일 한 줄 높이(px) — `h-16` + `space-y-2` 간격 */
const ROW_H = 72

export interface SettlementTransferRow {
  readonly fromId: string
  readonly toId: string
  readonly fromName: string
  readonly toName: string
  readonly amount: number
}

/**
 * 정산 이체 목록. 손익 합계가 어긋나면 정산표 대신 경고를, 주고받을 게 없으면 빈 상태를 보여준다.
 * 이체 건수가 늘어도 스크롤 없이 페이지로 넘긴다.
 */
export function SettlementTransferList({
  transfers,
  imbalancedAmount,
}: {
  transfers: readonly SettlementTransferRow[]
  /** 손익 합계가 0이 아니어서 정산표를 만들 수 없을 때 그 어긋난 값 */
  imbalancedAmount?: number
}) {
  const { d } = useDict()
  const isDesktop = useIsDesktop()
  const rowHeight = isDesktop ? DATA_TABLE_ROW_H : ROW_H
  const reserve = isDesktop ? DATA_TABLE_HEADER_H : 0
  const paged = usePagedRows({ items: transfers, rowHeight, reserve })

  const settled = imbalancedAmount === undefined

  function transferCell(transfer: SettlementTransferRow) {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-medium">{transfer.fromName}</span>
        <span className="shrink-0 text-muted">→</span>
        <span className="truncate font-medium">{transfer.toName}</span>
      </span>
    )
  }

  return (
    <Panel
      className="flex min-h-0 flex-1 flex-col gap-2"
      style={{ minHeight: listPanelMinHeight(rowHeight, reserve) }}
    >
      <div ref={paged.areaRef} className="min-h-0 flex-1 overflow-hidden">
        {!settled ? (
          <Alert tone="error">
            {format(d.result.settlementImbalanced, { n: imbalancedAmount.toLocaleString() })}
          </Alert>
        ) : transfers.length === 0 ? (
          <EmptyState title={d.result.nothingToSettle} />
        ) : (
          <>
            <div className="hidden lg:block">
              <DataTable
                label={d.result.transfersAria}
                columns={[
                  {
                    key: 'transfer',
                    header: d.result.colTransfer,
                    noTruncate: true,
                    cell: transferCell,
                  },
                  {
                    key: 'amount',
                    header: d.result.colAmount,
                    width: '8rem',
                    align: 'end',
                    cellClassName: 'font-bold tabular-nums',
                    cell: (transfer: SettlementTransferRow) => transfer.amount.toLocaleString(),
                  },
                ]}
                rows={paged.rows}
                rowKey={(transfer) => `${transfer.fromId}:${transfer.toId}`}
              />
            </div>
            <ul className="space-y-2 lg:hidden" aria-label={d.result.transfersAria}>
              {paged.rows.map((transfer) => (
                <li
                  key={`${transfer.fromId}:${transfer.toId}`}
                  className="flex h-16 items-center justify-between gap-3 rounded-xl bg-bg-deep/60 px-3"
                >
                  {transferCell(transfer)}
                  <span className="shrink-0 font-black tabular-nums">
                    {transfer.amount.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {settled && transfers.length > 0 ? (
        <Pager
          page={paged.page}
          pageCount={paged.pageCount}
          from={paged.from}
          to={paged.to}
          total={paged.total}
          onPage={paged.setPage}
        />
      ) : null}
    </Panel>
  )
}
