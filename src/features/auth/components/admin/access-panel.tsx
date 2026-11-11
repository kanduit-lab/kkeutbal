'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  ConfirmDialog,
  DATA_TABLE_HEADER_H,
  DATA_TABLE_ROW_H,
  useFitCount,
  useIsDesktop,
  useToast,
} from '@/components/ui'
import { format, translateError, useDict } from '@/lib/i18n/client'
import {
  createGuestToken,
  createRegistrationCode,
  revokeGuestToken,
  revokeRegistrationCode,
} from '../../admin-actions'
import { loadAdminAccessPage } from '../../admin-dashboard-actions'
import { IssueSecretPanel } from './issue-secret-panel'
import { RevocableList, type RevocableItem } from './revocable-list'

type AccessKind = 'registrationCodes' | 'guestTokens'

/** 모바일 한 줄 높이(px) — `h-14` + `space-y-2` 간격 */
const ROW_H = 64

export function AccessPanel({
  kind,
  items,
  total,
  onDataChanged,
}: {
  kind: AccessKind
  items: readonly RevocableItem[]
  total: number
  onDataChanged: () => void
}) {
  const { d } = useDict()
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [latestValue, setLatestValue] = useState<string | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<RevocableItem | null>(null)
  const [page, setPage] = useState(0)
  const isDesktop = useIsDesktop()
  const { areaRef, count: pageSize } = useFitCount({
    rowHeight: isDesktop ? DATA_TABLE_ROW_H : ROW_H,
    reserve: isDesktop ? DATA_TABLE_HEADER_H : 0,
  })
  const [refreshKey, setRefreshKey] = useState(0)
  const [pageState, setPageState] = useState({ items, total, loading: false })
  // 로딩은 effect 안에서 켰다 끄지 않는다. 지금 화면이 `이번 요청 결과인가`를 값으로 비교한다.
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const requestKey = `${page}:${pageSize}:${refreshKey}`
  const loading = loadedKey !== requestKey
  const copy = kind === 'registrationCodes' ? d.adminConsole.registrationCodes : d.adminConsole.guestTokens

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const result = await loadAdminAccessPage({ kind, page, pageSize })
        if (cancelled) return
        if (result.success) {
          const pageCount = Math.max(1, Math.ceil(result.data.total / pageSize))
          if (page >= pageCount) {
            setPage(pageCount - 1)
            return
          }
          setPageState({ items: result.data.items, total: result.data.total, loading: false })
          setLoadedKey(requestKey)
          return
        }
        toast(translateError(d, result.error), 'error')
      } catch (error) {
        console.error('load admin access page failed:', error)
        if (!cancelled) toast(translateError(d, 'errors.adminDashboardLoadFailed'), 'error')
      }
      if (!cancelled) setLoadedKey(requestKey)
    })()
    return () => {
      cancelled = true
    }
  }, [d, kind, page, pageSize, refreshKey, toast, requestKey])

  function refresh() {
    setPage(0)
    setRefreshKey((current) => current + 1)
    onDataChanged()
  }

  function issue(input: { label: string; expiresInHours: number }) {
    if (isPending) return
    startTransition(async () => {
      const result =
        kind === 'registrationCodes'
          ? await createRegistrationCode(input)
          : await createGuestToken(input)
      if (result.success) {
        setLatestValue(result.data.code)
        toast(copy.issued, 'success')
        refresh()
      } else {
        toast(translateError(d, result.error), 'error')
      }
    })
  }

  function revoke() {
    const target = revokeTarget
    setRevokeTarget(null)
    if (!target) return
    startTransition(async () => {
      const result =
        kind === 'registrationCodes'
          ? await revokeRegistrationCode({ codeId: target.id })
          : await revokeGuestToken({ tokenId: target.id })
      if (result.success) {
        toast(copy.revokedToast, 'success')
        refresh()
      } else {
        toast(translateError(d, result.error), 'error')
      }
    })
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="shrink-0">
          <IssueSecretPanel
            title={copy.issueTitle}
            description={copy.issueDescription}
            issueLabel={copy.issue}
            latestLabel={copy.latest}
            copiedMessage={copy.copied}
            latestValue={latestValue}
            isPending={isPending}
            onIssue={issue}
            onAcknowledge={() => setLatestValue(null)}
          />
        </div>
        <RevocableList
          heading={copy.listTitle}
          items={pageState.items}
          total={pageState.total}
          emptyTitle={copy.empty}
          emptyHint={copy.emptyHint}
          disabled={isPending}
          loading={loading}
          page={page}
          pageSize={pageSize}
          areaRef={areaRef}
          onPage={setPage}
          onRevoke={setRevokeTarget}
        />
      </div>
      <ConfirmDialog
        open={revokeTarget !== null}
        title={format(copy.revokeTitle, { label: revokeTarget?.label ?? '' })}
        body={copy.revokeBody}
        confirmLabel={d.adminConsole.revoke}
        tone="danger"
        onConfirm={revoke}
        onClose={() => setRevokeTarget(null)}
      />
    </>
  )
}
