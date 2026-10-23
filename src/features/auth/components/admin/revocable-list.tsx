'use client'

import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Pager,
  Panel,
  PanelHeader,
} from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'
import { formatDate } from './format'

export interface RevocableItem {
  readonly id: string
  readonly label: string
  readonly createdByName: string
  readonly createdAt: string
  readonly expiresAt: string | null
  readonly revokedAt: string | null
}

export function RevocableList<T extends RevocableItem>({
  heading,
  items,
  emptyTitle,
  emptyHint,
  disabled,
  total,
  page,
  pageSize,
  areaRef,
  loading,
  onPage,
  onRevoke,
}: {
  heading: string
  items: readonly T[]
  emptyTitle: string
  emptyHint: string
  disabled: boolean
  total: number
  page: number
  pageSize: number
  areaRef: React.RefObject<HTMLDivElement | null>
  loading: boolean
  onPage: (page: number) => void
  onRevoke: (item: T) => void
}) {
  const { d, locale } = useDict()
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : page * pageSize + 1
  const to = page * pageSize + items.length

  function isExpired(item: T): boolean {
    return item.expiresAt !== null && Date.parse(item.expiresAt) < Date.now()
  }

  function validity(item: T): string {
    return item.expiresAt
      ? format(d.adminConsole.until, { date: formatDate(locale, item.expiresAt) })
      : d.adminConsole.neverExpires
  }

  function statusCell(item: T) {
    if (item.revokedAt) return <Badge tone="muted">{d.adminConsole.revoked}</Badge>
    if (isExpired(item)) return <Badge tone="muted">{d.adminConsole.expired}</Badge>
    return (
      <Button size="sm" variant="danger" loading={disabled} onClick={() => onRevoke(item)}>
        {d.adminConsole.revoke}
      </Button>
    )
  }

  return (
    <Panel className="flex min-h-0 flex-1 flex-col gap-3">
      <PanelHeader
        title={heading}
        badge={<Badge tone="muted">{format(d.common.itemCount, { n: total })}</Badge>}
      />
      <div ref={areaRef} className="min-h-0 flex-1 overflow-hidden" aria-busy={loading}>
        {items.length === 0 && !loading ? (
          <EmptyState title={emptyTitle} hint={emptyHint} />
        ) : (
          <>
            <div className="hidden lg:block">
              <DataTable
                label={heading}
                columns={[
                  {
                    key: 'label',
                    header: d.adminConsole.colLabel,
                    cell: (item: T) => (
                      <span
                        className={
                          item.revokedAt || isExpired(item)
                            ? 'truncate font-bold line-through opacity-50'
                            : 'truncate font-bold'
                        }
                      >
                        {item.label}
                      </span>
                    ),
                  },
                  {
                    key: 'issuedBy',
                    header: d.adminConsole.colIssuedBy,
                    width: '8rem',
                    cellClassName: 'text-muted',
                    cell: (item: T) => item.createdByName,
                  },
                  {
                    key: 'validity',
                    header: d.adminConsole.colValidity,
                    width: '9rem',
                    cellClassName: 'text-muted',
                    cell: (item: T) => validity(item),
                  },
                  {
                    key: 'status',
                    header: d.adminConsole.colStatus,
                    width: '6.5rem',
                    align: 'end',
                    noTruncate: true,
                    cell: statusCell,
                  },
                ]}
                rows={items}
                rowKey={(item) => item.id}
              />
            </div>
            <ul className="space-y-2 lg:hidden">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex h-14 items-center justify-between gap-3 rounded-xl bg-inset px-3"
                >
                  <div className="min-w-0">
                    <p
                      className={`truncate font-bold ${
                        item.revokedAt || isExpired(item) ? 'line-through opacity-50' : ''
                      }`}
                    >
                      {item.label}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {item.createdByName} · {formatDate(locale, item.createdAt)} ·{' '}
                      {validity(item)}
                    </p>
                  </div>
                  <div className="shrink-0">{statusCell(item)}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {total > 0 ? (
        <Pager
          page={page}
          pageCount={pageCount}
          from={from}
          to={to}
          total={total}
          onPage={onPage}
        />
      ) : null}
    </Panel>
  )
}
