'use client'

import { Badge, Button, EmptyState, Panel } from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'
import { formatDate } from './format'

/** 가입코드·게스트 토큰이 공유하는 최소 모양 — 두 목록이 같은 컴포넌트를 쓰기 위한 계약. */
export interface RevocableItem {
  readonly id: string
  readonly label: string
  readonly createdByName: string
  readonly createdAt: string
  readonly expiresAt: string | null
  readonly revokedAt: string | null
}

/**
 * 회수 가능한 발급물 목록. 가입코드 목록과 게스트 토큰 목록이 라벨과 회수 대상만
 * 다른 채로 통째로 복붙돼 있어서 하나로 합쳤다 — 한쪽만 고쳐서 벌어지던 드리프트를 막는다.
 */
export function RevocableList<T extends RevocableItem>({
  heading,
  items,
  emptyTitle,
  emptyHint,
  disabled,
  onRevoke,
}: {
  heading: string
  items: readonly T[]
  emptyTitle: string
  emptyHint: string
  disabled: boolean
  onRevoke: (item: T) => void
}) {
  const { d, locale } = useDict()
  return (
    <Panel className="space-y-3">
      <h2 className="font-bold">{heading}</h2>
      {items.length === 0 ? (
        <EmptyState title={emptyTitle} hint={emptyHint} />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const expired = item.expiresAt !== null && Date.parse(item.expiresAt) < Date.now()
            const dead = item.revokedAt !== null || expired
            return (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-bg-deep/60 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className={`truncate font-bold ${dead ? 'line-through opacity-50' : ''}`}>
                    {item.label}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {item.createdByName} · {formatDate(locale, item.createdAt)} ·{' '}
                    {item.expiresAt
                      ? format(d.adminConsole.until, { date: formatDate(locale, item.expiresAt) })
                      : d.adminConsole.neverExpires}
                  </p>
                </div>
                {item.revokedAt ? (
                  <Badge tone="muted">{d.adminConsole.revoked}</Badge>
                ) : expired ? (
                  <Badge tone="muted">{d.adminConsole.expired}</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="danger"
                    loading={disabled}
                    onClick={() => onRevoke(item)}
                  >
                    {d.adminConsole.revoke}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
