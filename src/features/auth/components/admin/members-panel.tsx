'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  DATA_TABLE_HEADER_H,
  DATA_TABLE_ROW_H,
  EmptyState,
  Pager,
  Panel,
  PanelHeader,
  usePagedRows,
  useIsDesktop,
  useToast,
} from '@/components/ui'
import { format, translateError, useDict } from '@/lib/i18n/client'
import { setAdmin } from '../../admin-actions'
import type { AdminUserView } from '../../admin-queries'
import {
  EMPTY_MEMBER_QUERY,
  filterMembers,
  isMemberQueryActive,
  memberQueryKey,
  type MemberQuery,
} from './members-filter'
import { MEMBER_ROW_H, MemberCardRow, memberColumns } from './members-rows'
import { MembersToolbar } from './members-toolbar'

/**
 * 회원 조회·권한 관리. 회원 한 명이 정확히 한 줄이고, 넘치는 인원은
 * 스크롤이 아니라 페이지로 넘긴다 — 화면 밖으로 나가는 줄이 없다.
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
  const [query, setQuery] = useState<MemberQuery>(EMPTY_MEMBER_QUERY)
  const [adminTarget, setAdminTarget] = useState<AdminUserView | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const isDesktop = useIsDesktop()

  const copy = d.adminConsole.members
  const filtered = useMemo(() => filterMembers(users, query), [users, query])
  const active = isMemberQueryActive(query)
  const paged = usePagedRows({
    items: filtered,
    rowHeight: isDesktop ? DATA_TABLE_ROW_H : MEMBER_ROW_H,
    reserve: isDesktop ? DATA_TABLE_HEADER_H : 0,
    resetKey: memberQueryKey(query),
  })

  function roleAction(user: AdminUserView) {
    const selfLocked = user.id === selfId && user.isAdmin
    return (
      <Button
        size="sm"
        variant={user.isAdmin ? 'danger' : 'outline'}
        loading={isPending && pendingId === user.id}
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
        {user.isAdmin ? d.adminConsole.permissions.revokeAdmin : d.adminConsole.permissions.grant}
      </Button>
    )
  }

  return (
    <>
      <Panel className="flex min-h-0 flex-1 flex-col gap-3">
        <PanelHeader
          title={copy.title}
          badge={
            <Badge tone="muted">
              {active
                ? format(copy.countFiltered, { shown: filtered.length, total: users.length })
                : format(copy.count, { n: users.length })}
            </Badge>
          }
        />
        <MembersToolbar query={query} onChange={setQuery} />
        <div ref={paged.areaRef} className="min-h-0 flex-1 overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState
              title={copy.empty}
              hint={active ? copy.emptyFilterHint : copy.emptyHint}
              action={
                active ? (
                  <Button size="sm" variant="outline" onClick={() => setQuery(EMPTY_MEMBER_QUERY)}>
                    {copy.reset}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="hidden lg:block">
                <DataTable
                  label={copy.tableLabel}
                  columns={memberColumns({ d, locale, action: roleAction })}
                  rows={paged.rows}
                  rowKey={(user) => user.id}
                  rowHighlight={(user) => user.id === selfId}
                />
              </div>
              <ul className="space-y-2 lg:hidden">
                {paged.rows.map((user) => (
                  <MemberCardRow
                    key={user.id}
                    user={user}
                    d={d}
                    locale={locale}
                    isSelf={user.id === selfId}
                    action={roleAction(user)}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
        {filtered.length > 0 ? (
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
          setPendingId(target.id)
          startTransition(async () => {
            const result = await setAdmin({ targetUserId: target.id, isAdmin: !target.isAdmin })
            setPendingId(null)
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
