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
  Field,
  Input,
  Pager,
  Panel,
  PanelHeader,
  usePagedRows,
  useIsDesktop,
  useToast,
} from '@/components/ui'
import { CreditAdminDialog } from '@/features/wallet/components/credit-admin'
import { format, translateError, useDict } from '@/lib/i18n/client'
import { setAdminBulk, setMemberStatus } from '../../member-actions'
import type { AdminUserView } from '../../admin-queries'
import type { MemberBulkFailure } from '../../member-types'
import {
  EMPTY_MEMBER_QUERY,
  filterMembers,
  isMemberQueryActive,
  memberQueryKey,
  type MemberQuery,
} from './members-filter'
import { MEMBER_ROW_H, MemberCardRow, memberColumns } from './members-rows'
import { MembersToolbar } from './members-toolbar'
import { MemberDetailDialog } from './member-detail-dialog'
import { SelectBox } from './select-box'
import { selectionState, useRowSelection } from './use-row-selection'

/** 확인 다이얼로그가 필요한 일괄 작업. 되돌리기 어려운 것만 여기에 있다. */
type BulkAction = 'grantAdmin' | 'revokeAdmin' | 'suspend'

/**
 * 회원 조회·관리. 회원 한 명이 정확히 한 줄이고, 넘치는 인원은 스크롤이 아니라
 * 페이지로 넘긴다 — 화면 밖으로 나가는 줄이 없다.
 *
 * 개별 회원 조작(프로필·비밀번호·정지·삭제·크레딧)은 전부 상세 다이얼로그로 들어간다.
 * 표에는 여러 명을 한 번에 훑고 고르는 일만 남긴다.
 */
export function MembersPanel({
  users,
  total,
  selfId,
  onDataChanged,
}: {
  users: readonly AdminUserView[]
  total: number
  selfId: string
  onDataChanged: () => void
}) {
  const { d, locale } = useDict()
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [query, setQuery] = useState<MemberQuery>(EMPTY_MEMBER_QUERY)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [creditTarget, setCreditTarget] = useState<{ userId?: string } | null>(null)
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null)
  const [bulkReason, setBulkReason] = useState('')
  const [failures, setFailures] = useState<readonly MemberBulkFailure[]>([])
  // 크레딧을 상세 다이얼로그 위에서 조정하면 뒤에 열려 있는 상세의 잔액이 옛 값으로 남는다.
  const [detailReloadToken, setDetailReloadToken] = useState(0)
  const isDesktop = useIsDesktop()

  const copy = d.adminConsole.members
  const filtered = useMemo(() => filterMembers(users, query), [users, query])
  const active = isMemberQueryActive(query)
  const selection = useRowSelection(filtered)
  const paged = usePagedRows({
    items: filtered,
    rowHeight: isDesktop ? DATA_TABLE_ROW_H : MEMBER_ROW_H,
    reserve: isDesktop ? DATA_TABLE_HEADER_H : 0,
    resetKey: memberQueryKey(query),
  })

  // 헤더 체크박스의 범위는 **지금 보이는 페이지**다. 페이지를 넘겨가며 고른 것은 그대로 쌓인다.
  const pageState = selectionState(paged.rows, selection.selectedIds)
  const nameOf = (userId: string) =>
    users.find((user) => user.id === userId)?.displayName ?? userId

  function runBulk(action: BulkAction) {
    const ids = [...selection.selectedIds]
    const reason = bulkReason.trim()
    setBulkAction(null)
    setBulkReason('')
    if (ids.length === 0) return
    setFailures([])
    startTransition(async () => {
      const result =
        action === 'suspend'
          ? await setMemberStatus({ targetUserIds: ids, status: 'suspended', reason })
          : await setAdminBulk({ targetUserIds: ids, isAdmin: action === 'grantAdmin' })

      if (!result.success) {
        toast(translateError(d, result.error), 'error')
        return
      }
      const { changed, failed } = result.data
      setFailures(failed)
      selection.clear()
      if (changed.length === 0) {
        toast(copy.bulkNoneToast, 'error')
      } else if (failed.length === 0) {
        toast(format(copy.bulkDoneToast, { n: changed.length }), 'success')
      } else {
        toast(
          format(copy.bulkPartialToast, { changed: changed.length, failed: failed.length }),
          'error',
        )
      }
      onDataChanged()
    })
  }

  function selectBox(user: AdminUserView) {
    return (
      <SelectBox
        checked={selection.isSelected(user.id)}
        disabled={isPending}
        onChange={() => selection.toggle(user.id)}
        label={format(copy.selectRowAria, { name: user.displayName })}
      />
    )
  }

  function manageButton(user: AdminUserView) {
    return (
      <Button size="sm" variant="outline" disabled={isPending} onClick={() => setDetailId(user.id)}>
        {copy.manage}
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
                : total > users.length
                  ? format(copy.countCapped, { shown: users.length, total })
                  : format(copy.count, { n: users.length })}
            </Badge>
          }
          actions={
            <Button size="sm" variant="surface" onClick={() => setCreditTarget({})}>
              {d.wallet.admin.openDialog}
            </Button>
          }
        />
        <MembersToolbar query={query} onChange={setQuery} />

        {filtered.length > paged.rows.length ? (
          <Button
            size="sm"
            variant="surface"
            className="shrink-0"
            disabled={isPending}
            onClick={() => selection.toggleAll(filtered)}
          >
            {selection.count >= filtered.length
              ? copy.clearSelection
              : format(copy.selectFiltered, { n: filtered.length })}
          </Button>
        ) : null}

        {selection.count > 0 ? (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl bg-accent/10 px-3 py-2">
            <p className="text-sm font-bold text-accent">
              {format(copy.selectedCount, { n: selection.count })}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="surface" disabled={isPending} onClick={selection.clear}>
                {copy.clearSelection}
              </Button>
              <Button
                size="sm"
                variant="outline"
                loading={isPending}
                onClick={() => setBulkAction('grantAdmin')}
              >
                {d.adminConsole.permissions.grant}
              </Button>
              <Button
                size="sm"
                variant="outline"
                loading={isPending}
                onClick={() => setBulkAction('revokeAdmin')}
              >
                {d.adminConsole.permissions.revokeAdmin}
              </Button>
              <Button
                size="sm"
                variant="danger"
                loading={isPending}
                onClick={() => setBulkAction('suspend')}
              >
                {d.adminConsole.memberDetail.suspend}
              </Button>
            </div>
          </div>
        ) : null}

        {failures.length > 0 ? (
          <div className="shrink-0 space-y-1 rounded-xl bg-lose/10 px-3 py-2">
            <p className="text-sm font-bold text-lose">
              {format(copy.bulkFailedTitle, { n: failures.length })}
            </p>
            <ul className="max-h-24 space-y-0.5 overflow-y-auto overscroll-contain">
              {failures.map((failure) => (
                <li key={failure.userId} className="text-xs text-muted">
                  <span className="font-bold">{nameOf(failure.userId)}</span>{' '}
                  {translateError(d, failure.error)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

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
              <div className="hidden overflow-x-auto lg:block">
                <DataTable
                  className="min-w-[52rem]"
                  label={copy.tableLabel}
                  columns={memberColumns({
                    d,
                    locale,
                    select: selectBox,
                    selectAll: (
                      <SelectBox
                        checked={pageState === 'all'}
                        indeterminate={pageState === 'some'}
                        disabled={isPending}
                        onChange={() => selection.toggleAll(paged.rows)}
                        label={copy.selectAllAria}
                      />
                    ),
                    action: manageButton,
                  })}
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
                    select={selectBox(user)}
                    action={manageButton(user)}
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

      <MemberDetailDialog
        userId={detailId}
        selfId={selfId}
        reloadToken={detailReloadToken}
        onClose={() => setDetailId(null)}
        onDataChanged={onDataChanged}
        onAdjustCredits={(userId) => setCreditTarget({ userId })}
      />

      <CreditAdminDialog
        open={creditTarget !== null}
        users={users}
        fixedUserId={creditTarget?.userId}
        onClose={() => setCreditTarget(null)}
        onDataChanged={() => {
          setDetailReloadToken((token) => token + 1)
          onDataChanged()
        }}
      />

      <ConfirmDialog
        open={bulkAction !== null}
        title={format(
          bulkAction === 'suspend'
            ? d.adminConsole.memberDetail.bulkSuspendTitle
            : bulkAction === 'grantAdmin'
              ? d.adminConsole.permissions.bulkGrantTitle
              : d.adminConsole.permissions.bulkRevokeTitle,
          { n: selection.count },
        )}
        body={
          bulkAction === 'suspend'
            ? d.adminConsole.memberDetail.bulkSuspendBody
            : d.adminConsole.permissions.bulkBody
        }
        confirmDisabled={bulkAction === 'suspend' && bulkReason.trim() === ''}
        confirmLabel={
          bulkAction === 'suspend'
            ? d.adminConsole.memberDetail.suspend
            : bulkAction === 'grantAdmin'
              ? d.adminConsole.permissions.grantConfirm
              : d.adminConsole.permissions.revokeConfirm
        }
        tone={bulkAction === 'grantAdmin' ? 'primary' : 'danger'}
        onConfirm={() => bulkAction && runBulk(bulkAction)}
        onClose={() => {
          setBulkAction(null)
          setBulkReason('')
        }}
      >
        {/* 정지 사유는 영구 기록으로 남는다. 확인 다이얼로그에서 직접 받는다. */}
        {bulkAction === 'suspend' ? (
          <Field label={d.adminConsole.memberDetail.reasonLabel}>
            {(control) => (
              <Input
                {...control}
                value={bulkReason}
                onChange={(event) => setBulkReason(event.target.value)}
                maxLength={200}
                placeholder={d.adminConsole.memberDetail.reasonPlaceholder}
              />
            )}
          </Field>
        ) : null}
      </ConfirmDialog>
    </>
  )
}
