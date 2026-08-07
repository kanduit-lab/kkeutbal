'use client'

import { Input, Select } from '@/components/ui'
import { useDict } from '@/lib/i18n/client'
import type { AccountFilter, MemberQuery, RoleFilter, StatusFilter } from './members-filter'

const ACCOUNTS: readonly AccountFilter[] = ['all', 'internal', 'sso', 'guest']
const ROLES: readonly RoleFilter[] = ['all', 'admin', 'member']
const STATUSES: readonly StatusFilter[] = ['active', 'suspended', 'deleted', 'all']

/** 검색 한 줄 + 필터 세 개. 높이가 고정이라 목록이 쓸 공간을 흔들지 않는다. */
export function MembersToolbar({
  query,
  onChange,
}: {
  query: MemberQuery
  onChange: (next: MemberQuery) => void
}) {
  const { d } = useDict()
  const copy = d.adminConsole.members

  function accountLabel(value: AccountFilter): string {
    if (value === 'all') return copy.filterAccountAll
    if (value === 'internal') return d.adminConsole.accountType.internal
    if (value === 'sso') return d.adminConsole.accountType.sso
    return d.adminConsole.accountType.guest
  }

  function roleLabel(value: RoleFilter): string {
    if (value === 'all') return copy.filterRoleAll
    return value === 'admin' ? copy.filterRoleAdmin : copy.filterRoleMember
  }

  function statusLabel(value: StatusFilter): string {
    return value === 'all' ? copy.filterStatusAll : d.adminConsole.status[value]
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 lg:flex-row lg:items-center">
      <Input
        aria-label={copy.searchLabel}
        value={query.text}
        onChange={(event) => onChange({ ...query, text: event.target.value })}
        placeholder={copy.searchPlaceholder}
        maxLength={20}
        className="lg:min-w-0 lg:flex-1"
      />
      <div className="grid grid-cols-3 gap-2 lg:flex lg:shrink-0">
        <div className="lg:w-36">
          <Select
            aria-label={copy.filterAccountLabel}
            value={query.account}
            onChange={(event) =>
              onChange({ ...query, account: event.target.value as AccountFilter })
            }
          >
            {ACCOUNTS.map((value) => (
              <option key={value} value={value}>
                {accountLabel(value)}
              </option>
            ))}
          </Select>
        </div>
        <div className="lg:w-32">
          <Select
            aria-label={copy.filterRoleLabel}
            value={query.role}
            onChange={(event) => onChange({ ...query, role: event.target.value as RoleFilter })}
          >
            {ROLES.map((value) => (
              <option key={value} value={value}>
                {roleLabel(value)}
              </option>
            ))}
          </Select>
        </div>
        <div className="lg:w-32">
          <Select
            aria-label={copy.filterStatusLabel}
            value={query.status}
            onChange={(event) => onChange({ ...query, status: event.target.value as StatusFilter })}
          >
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {statusLabel(value)}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </div>
  )
}
