'use client'

import {
  DataTable,
  DATA_TABLE_HEADER_H,
  DATA_TABLE_ROW_H,
  EmptyState,
  Pager,
  Panel,
  PanelHeader,
  usePagedRows,
  useIsDesktop,
  ButtonLink,
} from '@/components/ui'
import { format, useDict, type Dictionary } from '@/lib/i18n/client'
import type { Locale } from '@/lib/i18n/config'
import type { CreditWalletSnapshot } from '../actions'

type Transaction = CreditWalletSnapshot['transactions'][number]

/** 모바일 한 줄 높이(px) — `h-16` + `space-y-2` 간격 */
const ROW_H = 72

function signed(locale: Locale, value: number): string {
  return `${value > 0 ? '+' : ''}${value.toLocaleString(locale)}`
}

function transactionLabel(d: Dictionary, kind: Transaction['kind']): string {
  switch (kind) {
    case 'admin_grant':
      return d.wallet.kind.adminGrant
    case 'admin_revoke':
      return d.wallet.kind.adminRevoke
    case 'room_lock':
      return d.wallet.kind.roomLock
    case 'room_settlement':
      return d.wallet.kind.roomSettlement
    case 'correction':
      return d.wallet.kind.correction
  }
}

function formatDateTime(locale: Locale, value: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  )
}

/** 크레딧 원장. 건수가 늘어도 페이지로 넘기고 화면 밖으로 밀지 않는다. */
export function CreditHistory({ transactions }: { transactions: readonly Transaction[] }) {
  const { d, locale } = useDict()
  const isDesktop = useIsDesktop()
  const paged = usePagedRows({
    items: transactions,
    rowHeight: isDesktop ? DATA_TABLE_ROW_H : ROW_H,
    reserve: isDesktop ? DATA_TABLE_HEADER_H : 0,
  })

  function change(transaction: Transaction): number {
    return transaction.deltaAvailable + transaction.deltaLocked
  }

  function movement(transaction: Transaction): string {
    return transaction.deltaLocked
      ? format(d.wallet.movement, {
          available: signed(locale, transaction.deltaAvailable),
          locked: signed(locale, transaction.deltaLocked),
        })
      : signed(locale, transaction.deltaAvailable)
  }

  function changeText(transaction: Transaction): string {
    const total = change(transaction)
    return total === 0 ? movement(transaction) : signed(locale, total)
  }

  function changeClass(transaction: Transaction): string {
    const total = change(transaction)
    return total > 0 ? 'text-win' : total < 0 ? 'text-accent' : 'text-muted'
  }

  function balanceText(transaction: Transaction): string {
    return format(d.wallet.balanceAfter, {
      available: transaction.availableAfter.toLocaleString(locale),
      locked: transaction.lockedAfter.toLocaleString(locale),
    })
  }

  return (
    <Panel
      style={{ maxHeight: paged.maxPanelHeight }}
      className="flex min-h-0 flex-1 flex-col gap-3"
    >
      <PanelHeader title={d.wallet.historyTitle} description={d.wallet.historyHint} />
      <div ref={paged.areaRef} className="min-h-0 flex-1 overflow-hidden">
        {transactions.length === 0 ? (
          <EmptyState
            title={d.wallet.historyEmpty}
            hint={d.wallet.historyEmptyHint}
            action={
              <ButtonLink href="/rooms/new" variant="surface" size="sm">
                {d.home.newRoom}
              </ButtonLink>
            }
          />
        ) : (
          <>
            <div className="hidden lg:block">
              <DataTable
                label={d.wallet.historyTitle}
                columns={[
                  {
                    key: 'reason',
                    header: d.wallet.colEntry,
                    cellClassName: 'font-medium',
                    cell: (transaction: Transaction) => transaction.reason,
                  },
                  {
                    key: 'kind',
                    header: d.wallet.colKind,
                    width: '8rem',
                    cellClassName: 'text-muted',
                    cell: (transaction: Transaction) => transactionLabel(d, transaction.kind),
                  },
                  {
                    key: 'when',
                    header: d.wallet.colWhen,
                    width: '9rem',
                    cellClassName: 'text-muted tabular-nums',
                    cell: (transaction: Transaction) =>
                      formatDateTime(locale, transaction.createdAt),
                  },
                  {
                    key: 'change',
                    header: d.wallet.colChange,
                    width: '8rem',
                    align: 'end',
                    cell: (transaction: Transaction) => (
                      <span
                        className={`font-black tabular-nums ${changeClass(transaction)}`}
                      >
                        {changeText(transaction)}
                      </span>
                    ),
                  },
                  {
                    key: 'balance',
                    header: d.wallet.colBalance,
                    width: '11rem',
                    align: 'end',
                    cellClassName: 'text-muted tabular-nums',
                    cell: balanceText,
                  },
                ]}
                rows={paged.rows}
                rowKey={(transaction) => transaction.id}
              />
            </div>
            <ul className="space-y-2 lg:hidden">
              {paged.rows.map((transaction) => (
                <li
                  key={transaction.id}
                  className="flex h-16 items-center justify-between gap-3 rounded-xl bg-inset px-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold">{transaction.reason}</p>
                    <p className="truncate text-xs text-muted">
                      {transactionLabel(d, transaction.kind)} ·{' '}
                      {formatDateTime(locale, transaction.createdAt)} · {balanceText(transaction)}
                    </p>
                  </div>
                  <p
                    className={`shrink-0 text-lg font-black tabular-nums ${changeClass(transaction)}`}
                  >
                    {changeText(transaction)}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {transactions.length > 0 ? (
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
