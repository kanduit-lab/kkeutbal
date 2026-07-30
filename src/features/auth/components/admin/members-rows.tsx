'use client'

import type { ReactNode } from 'react'
import { Badge, type DataColumn } from '@/components/ui'
import { format, type Dictionary } from '@/lib/i18n/client'
import type { Locale } from '@/lib/i18n/config'
import type { AdminUserView } from '../../admin-queries'
import { accountTypeLabel, formatDate } from './format'

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

/** 데스크톱 표: 한 회원이 한 줄이고, 권한 조작도 그 줄에서 끝난다. */
export function memberColumns({
  d,
  locale,
  action,
}: {
  d: Dictionary
  locale: Locale
  action: (user: AdminUserView) => ReactNode
}): readonly DataColumn<AdminUserView>[] {
  const copy = d.adminConsole.members
  return [
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
      width: '16rem',
      cellClassName: 'text-muted',
      cell: (user) => accountLine(d, user),
    },
    {
      key: 'joined',
      header: copy.colJoined,
      width: '7.5rem',
      cellClassName: 'text-muted tabular-nums',
      cell: (user) => formatDate(locale, user.createdAt),
    },
    {
      key: 'role',
      header: copy.colRole,
      width: '8rem',
      align: 'end',
      noTruncate: true,
      cell: (user) => action(user),
    },
  ]
}

/** 모바일 한 줄: 이름과 권한 버튼이 같은 줄, 계정 정보는 아래 줄. */
export function MemberCardRow({
  user,
  d,
  locale,
  isSelf,
  action,
}: {
  user: AdminUserView
  d: Dictionary
  locale: Locale
  isSelf: boolean
  action: ReactNode
}) {
  return (
    <li
      className={`flex h-16 items-center justify-between gap-3 rounded-xl px-3 ${
        isSelf ? 'bg-gold/10 ring-1 ring-inset ring-gold/25' : 'bg-bg-deep/60'
      }`}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-1.5">
          <span className="truncate font-bold">{user.displayName}</span>
          {user.isAdmin ? <Badge tone="accent">{d.adminConsole.members.adminBadge}</Badge> : null}
        </p>
        <p className="truncate text-xs text-muted">
          {accountLine(d, user)} ·{' '}
          {format(d.adminConsole.members.joinedAt, { date: formatDate(locale, user.createdAt) })}
        </p>
      </div>
      <div className="shrink-0">{action}</div>
    </li>
  )
}
