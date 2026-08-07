'use client'

import type { ReactNode } from 'react'
import { Badge, type DataColumn } from '@/components/ui'
import { format, type Dictionary } from '@/lib/i18n/client'
import type { Locale } from '@/lib/i18n/config'
import type { AdminUserView } from '../../admin-queries'
import { accountTypeLabel, formatDate } from './format'
import { MemberStatusBadge } from './member-status'

/** 모바일 한 줄 높이(px) — `h-16` + `space-y-2` 간격. 페이지 계산과 짝을 맞춘다 */
export const MEMBER_ROW_H = 72

function accountLine(d: Dictionary, user: AdminUserView): string {
  return [
    accountTypeLabel(d, user.authType),
    user.username ?? d.adminConsole.members.noUsername,
    user.phoneMasked,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function memberColumns({
  d,
  locale,
  select,
  selectAll,
  action,
}: {
  d: Dictionary
  locale: Locale
  select: (user: AdminUserView) => ReactNode
  selectAll: ReactNode
  action: (user: AdminUserView) => ReactNode
}): readonly DataColumn<AdminUserView>[] {
  const copy = d.adminConsole.members
  return [
    {
      key: 'select',
      width: '2.75rem',
      noTruncate: true,
      header: selectAll,
      cell: select,
    },
    {
      key: 'member',
      header: copy.colMember,
      cell: (user) => (
        <span className="flex items-center gap-1.5">
          <span className="truncate font-bold">{user.displayName}</span>
          {user.isAdmin ? <Badge tone="accent">{copy.adminBadge}</Badge> : null}
        </span>
      ),
    },
    {
      key: 'account',
      header: copy.colAccount,
      width: '15rem',
      cellClassName: 'text-muted',
      cell: (user) => accountLine(d, user),
    },
    {
      key: 'balance',
      header: copy.colBalance,
      width: '7rem',
      align: 'end',
      cellClassName: 'tabular-nums',
      cell: (user) => user.availableBalance.toLocaleString(),
    },
    {
      key: 'status',
      header: copy.colStatus,
      width: '6rem',
      noTruncate: true,
      cell: (user) =>
        user.status === 'active' ? (
          <span className="text-xs text-muted">{d.adminConsole.status.active}</span>
        ) : (
          <MemberStatusBadge status={user.status} d={d} />
        ),
    },
    {
      key: 'joined',
      header: copy.colJoined,
      width: '7.5rem',
      cellClassName: 'text-muted tabular-nums',
      cell: (user) => formatDate(locale, user.createdAt),
    },
    {
      key: 'action',
      header: copy.colAction,
      width: '6.5rem',
      align: 'end',
      noTruncate: true,
      cell: action,
    },
  ]
}

/** 모바일 한 줄: 선택·이름·조치가 같은 줄, 계정과 잔액은 아래 줄. */
export function MemberCardRow({
  user,
  d,
  locale,
  isSelf,
  select,
  action,
}: {
  user: AdminUserView
  d: Dictionary
  locale: Locale
  isSelf: boolean
  select: ReactNode
  action: ReactNode
}) {
  return (
    <li
      className={`flex h-16 items-center gap-3 rounded-xl px-3 ${
        isSelf ? 'bg-gold/10 ring-1 ring-inset ring-gold/25' : 'bg-bg-deep/60'
      }`}
    >
      <div className="shrink-0">{select}</div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5">
          <span className="truncate font-bold">{user.displayName}</span>
          {user.isAdmin ? <Badge tone="accent">{d.adminConsole.members.adminBadge}</Badge> : null}
          <MemberStatusBadge status={user.status} d={d} />
        </p>
        <p className="truncate text-xs text-muted">
          {accountLine(d, user)} · {user.availableBalance.toLocaleString()} ·{' '}
          {format(d.adminConsole.members.joinedAt, { date: formatDate(locale, user.createdAt) })}
        </p>
      </div>
      <div className="shrink-0">{action}</div>
    </li>
  )
}
