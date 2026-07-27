'use client'

import { useState, useTransition } from 'react'
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Panel,
  useToast,
} from '@/components/ui'
import { format, translateError, useDict } from '@/lib/i18n/client'
import { setAdmin } from '../../admin-actions'
import type { AdminUserView } from '../../admin-queries'
import { accountTypeLabel, formatDate } from './format'

/**
 * 회원 검색 목록과 권한 관리 목록. 검색 상자는 두 목록을 함께 거르므로 여기서
 * 같이 소유한다 — 예전에는 검색이 회원 패널에만 있고 권한 패널이 조용히 걸러져,
 * 모바일에서 무엇이 필터인지 알 방법이 없었다.
 */
export function MembersPanel({
  users,
  selfId,
  onDataChanged,
}: {
  users: readonly AdminUserView[]
  selfId: string
  onDataChanged: () => void
}) {
  const { d, locale } = useDict()
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [query, setQuery] = useState('')
  const [adminTarget, setAdminTarget] = useState<AdminUserView | null>(null)

  const normalized = query.trim().toLowerCase()
  const filtered = normalized
    ? users.filter((user) =>
        [user.displayName, user.username ?? '', user.phoneMasked ?? ''].some((value) =>
          value.toLowerCase().includes(normalized),
        ),
      )
    : users
  const emptyHint = normalized
    ? format(d.adminConsole.members.emptyHint, { query })
    : d.adminConsole.members.searchPlaceholder

  return (
    <>
      <Panel className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold">{d.adminConsole.members.title}</h2>
          <Badge tone="muted">{format(d.adminConsole.members.count, { n: filtered.length })}</Badge>
        </div>
        <Field label={d.adminConsole.members.searchLabel}>
          {(control) => (
            <Input
              {...control}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={d.adminConsole.members.searchPlaceholder}
              maxLength={20}
            />
          )}
        </Field>
        {filtered.length === 0 ? (
          <EmptyState title={d.adminConsole.members.empty} hint={emptyHint} />
        ) : (
          <ul className="space-y-2">
            {filtered.map((user) => (
              <li key={user.id} className="rounded-xl bg-bg-deep/60 px-3 py-2.5">
                <p className="flex items-center gap-1.5 font-bold">
                  <span className="truncate">{user.displayName}</span>
                  <Badge tone="muted">{accountTypeLabel(d, user.authType)}</Badge>
                  {user.isAdmin ? (
                    <Badge tone="accent">{d.adminConsole.members.adminBadge}</Badge>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {user.username ?? d.adminConsole.members.noUsername}
                  {user.phoneMasked ? ` · ${user.phoneMasked}` : ''} ·{' '}
                  {format(d.adminConsole.members.joinedAt, {
                    date: formatDate(locale, user.createdAt),
                  })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">{d.adminConsole.permissions.title}</h2>
          {normalized ? (
            <Badge tone="warn">{format(d.adminConsole.permissions.filteredBy, { query })}</Badge>
          ) : null}
        </div>
        {filtered.length === 0 ? (
          <EmptyState title={d.adminConsole.members.empty} hint={emptyHint} />
        ) : (
          <ul className="space-y-2">
            {filtered.map((user) => {
              const selfLocked = user.id === selfId && user.isAdmin
              return (
                <li
                  key={user.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-bg-deep/60 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 font-bold">
                      <span className="truncate">{user.displayName}</span>
                      {user.isAdmin ? (
                        <Badge tone="accent">{d.adminConsole.members.adminBadge}</Badge>
                      ) : null}
                      {user.isGuest ? (
                        <Badge tone="muted">{d.adminConsole.members.guestBadge}</Badge>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted">
                      {user.username ?? d.adminConsole.members.noUsername}
                      {user.phoneMasked ? ` · ${user.phoneMasked}` : ''}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={user.isAdmin ? 'danger' : 'outline'}
                    loading={isPending}
                    disabled={selfLocked || user.isGuest}
                    disabledReason={
                      selfLocked
                        ? d.adminConsole.permissions.cannotRevokeSelf
                        : user.isGuest
                          ? d.adminConsole.permissions.guestCannotBeAdmin
                          : undefined
                    }
                    onClick={() => setAdminTarget(user)}
                  >
                    {user.isAdmin
                      ? d.adminConsole.permissions.revokeAdmin
                      : d.adminConsole.permissions.grant}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <ConfirmDialog
        open={adminTarget !== null}
        title={format(
          adminTarget?.isAdmin
            ? d.adminConsole.permissions.revokeTitle
            : d.adminConsole.permissions.grantTitle,
          { name: adminTarget?.displayName ?? '' },
        )}
        body={
          adminTarget?.isAdmin
            ? d.adminConsole.permissions.revokeBody
            : d.adminConsole.permissions.grantBody
        }
        confirmLabel={
          adminTarget?.isAdmin
            ? d.adminConsole.permissions.revokeConfirm
            : d.adminConsole.permissions.grantConfirm
        }
        tone={adminTarget?.isAdmin ? 'danger' : 'primary'}
        onConfirm={() => {
          const target = adminTarget
          setAdminTarget(null)
          if (!target) return
          startTransition(async () => {
            const result = await setAdmin({ targetUserId: target.id, isAdmin: !target.isAdmin })
            if (result.success) {
              toast(d.adminConsole.permissions.changed, 'success')
              onDataChanged()
            } else {
              toast(translateError(d, result.error), 'error')
            }
          })
        }}
        onClose={() => setAdminTarget(null)}
      />
    </>
  )
}
