'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  DATA_TABLE_HEADER_H,
  DATA_TABLE_ROW_H,
  Input,
  Select,
  EmptyState,
  Pager,
  Panel,
  PanelHeader,
  useFitCount,
  useIsDesktop,
  useToast,
} from '@/components/ui'
import { GAME_BADGE_TONE } from '@/features/game/components/shared'
import { format, translateError, useDict } from '@/lib/i18n/client'
import { adminCloseRoom, adminCloseRooms } from '../../admin-actions'
import { loadAdminRoomsPage } from '../../admin-dashboard-actions'
import type { AdminBulkFailure, AdminRoomView } from '../../admin-queries'
import { formatAge } from './format'
import {
  EMPTY_ROOM_QUERY,
  isRoomQueryActive,
  type RoomQuery,
  type RoomStatusFilter,
} from './rooms-filter'
import { SelectBox } from './select-box'
import { selectionState, useRowSelection } from './use-row-selection'

const STATUS_FILTERS: readonly RoomStatusFilter[] = ['all', 'waiting', 'playing']

/** 모바일 한 줄 높이(px) — `h-16` + `space-y-2` 간격 */
const ROW_H = 72

export function RoomsPanel({
  rooms,
  total,
  onDataChanged,
}: {
  rooms: readonly AdminRoomView[]

  total: number
  onDataChanged: () => void
}) {
  const { d } = useDict()
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [closeTarget, setCloseTarget] = useState<AdminRoomView | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [failures, setFailures] = useState<readonly AdminBulkFailure[]>([])
  const [query, setQuery] = useState<RoomQuery>(EMPTY_ROOM_QUERY)
  const [page, setPage] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [pageState, setPageState] = useState({ rooms, total, loading: false })
  const isDesktop = useIsDesktop()
  const { areaRef, count: pageSize } = useFitCount({
    rowHeight: isDesktop ? DATA_TABLE_ROW_H : ROW_H,
    reserve: isDesktop ? DATA_TABLE_HEADER_H : 0,
  })

  const visibleRooms = pageState.rooms
  const selection = useRowSelection(visibleRooms)
  const active = isRoomQueryActive(query)
  const pageCount = Math.max(1, Math.ceil(pageState.total / pageSize))
  const pageStart = pageState.total === 0 ? 0 : page * pageSize + 1
  const pageEnd = page * pageSize + visibleRooms.length

  useEffect(() => {
    let cancelled = false
    setPageState((current) => ({ ...current, loading: true }))
    void (async () => {
      try {
        const result = await loadAdminRoomsPage({ ...query, page, pageSize })
        if (cancelled) return
        if (result.success) {
          const nextPageCount = Math.max(1, Math.ceil(result.data.total / pageSize))
          if (page >= nextPageCount) {
            setPage(nextPageCount - 1)
            return
          }
          setPageState({ rooms: result.data.rooms, total: result.data.total, loading: false })
          return
        }
        toast(translateError(d, result.error), 'error')
      } catch (error) {
        console.error('load admin rooms page failed:', error)
        if (!cancelled) toast(translateError(d, 'errors.adminDashboardLoadFailed'), 'error')
      }
      if (!cancelled) setPageState((current) => ({ ...current, loading: false }))
    })()
    return () => {
      cancelled = true
    }
  }, [d, page, pageSize, query, refreshKey, toast])

  const selectionStateForPage = selectionState(visibleRooms, selection.selectedIds)

  const codeOf = (roomId: string) => rooms.find((room) => room.id === roomId)?.code ?? roomId

  function runBulkClose() {
    const ids = [...selection.selectedIds]
    setBulkOpen(false)
    if (ids.length === 0) return
    setFailures([])
    startTransition(async () => {
      const result = await adminCloseRooms(ids)
      if (!result.success) {
        toast(translateError(d, result.error), 'error')
        return
      }
      const { closed, failed } = result.data
      setFailures(failed)
      selection.clear()
      if (failed.length === 0) {
        toast(format(d.adminConsole.rooms.bulkClosedToast, { n: closed.length }), 'success')
      } else {
        toast(
          format(d.adminConsole.rooms.bulkPartialToast, {
            closed: closed.length,
            failed: failed.length,
          }),
          'error',
        )
      }
      setRefreshKey((current) => current + 1)
      onDataChanged()
    })
  }

  function closeButton(room: AdminRoomView) {
    return (
      <Button
        size="sm"
        variant="danger"
        disabled={isPending}
        loading={isPending && pendingId === room.id}
        onClick={() => setCloseTarget(room)}
      >
        {d.adminConsole.rooms.close}
      </Button>
    )
  }

  return (
    <Panel className="flex min-h-0 flex-1 flex-col gap-3">
      <PanelHeader
        title={d.adminConsole.rooms.title}
        badge={
          <Badge tone="muted">
            {active
              ? format(d.adminConsole.rooms.countFiltered, {
                  shown: pageState.total,
                  total,
                })
              : format(d.common.itemCount, { n: pageState.total })}
          </Badge>
        }
      />

      <div className="flex shrink-0 flex-col gap-2 lg:flex-row lg:items-center">
        <Input
          aria-label={d.adminConsole.rooms.searchLabel}
          value={query.text}
          onChange={(event) => {
            setPage(0)
            setQuery({ ...query, text: event.target.value })
          }}
          placeholder={d.adminConsole.rooms.searchPlaceholder}
          maxLength={30}
          className="lg:min-w-0 lg:flex-1"
        />
        <div className="lg:w-32 lg:shrink-0">
          <Select
            aria-label={d.adminConsole.rooms.filterStatusLabel}
            value={query.status}
            onChange={(event) => {
              setPage(0)
              setQuery({ ...query, status: event.target.value as RoomStatusFilter })
            }}
          >
            {STATUS_FILTERS.map((value) => (
              <option key={value} value={value}>
                {value === 'all'
                  ? d.adminConsole.rooms.filterStatusAll
                  : value === 'playing'
                    ? d.common.playing
                    : d.common.waiting}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {selection.count > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl bg-accent/10 px-3 py-2">
          <p className="text-sm font-bold text-accent">
            {format(d.adminConsole.rooms.selectedCount, { n: selection.count })}
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="surface" disabled={isPending} onClick={selection.clear}>
              {d.adminConsole.rooms.clearSelection}
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={isPending}
              loadingLabel={d.ui.processing}
              onClick={() => setBulkOpen(true)}
            >
              {format(d.adminConsole.rooms.bulkClose, { n: selection.count })}
            </Button>
          </div>
        </div>
      ) : null}

      {failures.length > 0 ? (
        <div className="shrink-0 space-y-1 rounded-xl bg-lose/10 px-3 py-2">
          <p className="text-sm font-bold text-lose">
            {format(d.adminConsole.rooms.bulkFailedTitle, { n: failures.length })}
          </p>
          <ul className="space-y-0.5">
            {failures.map((failure) => (
              <li key={failure.roomId} className="text-xs text-muted">
                <span className="font-mono tracking-widest">{codeOf(failure.roomId)}</span>{' '}
                {translateError(d, failure.error)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div ref={areaRef} className="min-h-0 flex-1 overflow-hidden" aria-busy={pageState.loading}>
        {visibleRooms.length === 0 && !pageState.loading ? (
          <EmptyState
            title={d.adminConsole.rooms.empty}
            hint={
              isRoomQueryActive(query)
                ? d.adminConsole.rooms.emptyFilterHint
                : d.adminConsole.rooms.emptyHint
            }
          />
        ) : (
          <>
            {/*
              `DataTable`은 `table-fixed`라 고정폭 합이 패널 폭을 넘으면 유연 컬럼("방")이
              0으로 눌려 코드·이름이 통째로 사라진다. 운영 도구는 3분할 레이아웃이라 이
              패널이 400px 남짓까지 좁아진다 — 표를 자체 가로 스크롤 컨테이너에 넣고
              최소 폭을 줘서, 좁으면 잘리는 대신 스크롤되게 한다.
            */}
            <div className="hidden overflow-x-auto lg:block">
              <DataTable
                className="min-w-[46rem]"
                label={d.adminConsole.rooms.title}
                columns={[
                  {
                    key: 'select',
                    width: '2.75rem',
                    noTruncate: true,
                    header: (
                      <SelectBox
                        checked={selectionStateForPage === 'all'}
                        indeterminate={selectionStateForPage === 'some'}
                        disabled={isPending}
                        onChange={() => selection.toggleAll(visibleRooms)}
                        label={d.adminConsole.rooms.selectAllAria}
                      />
                    ),
                    cell: (room: AdminRoomView) => (
                      <SelectBox
                        checked={selection.isSelected(room.id)}
                        disabled={isPending}
                        onChange={() => selection.toggle(room.id)}
                        label={format(d.adminConsole.rooms.selectRowAria, { code: room.code })}
                      />
                    ),
                  },
                  {
                    key: 'room',
                    header: d.adminConsole.rooms.colRoom,
                    cell: (room: AdminRoomView) => (
                      <span className="flex items-center gap-1.5">
                        <span className="shrink-0 font-mono tracking-widest">{room.code}</span>
                        <span className="truncate font-bold">{room.name}</span>
                        <Badge tone={GAME_BADGE_TONE[room.gameType]}>
                          {d.games[room.gameType]}
                        </Badge>
                      </span>
                    ),
                  },
                  {
                    key: 'host',
                    header: d.adminConsole.rooms.colHost,
                    width: '8rem',
                    cellClassName: 'text-muted',
                    cell: (room: AdminRoomView) => room.hostName,
                  },
                  {
                    key: 'members',
                    header: d.adminConsole.rooms.colMembers,
                    width: '5rem',
                    align: 'end',
                    cellClassName: 'tabular-nums text-muted',
                    cell: (room: AdminRoomView) => room.memberCount,
                  },
                  {
                    key: 'age',
                    header: d.adminConsole.rooms.colAge,
                    width: '7rem',
                    cellClassName: 'text-muted',
                    cell: (room: AdminRoomView) => formatAge(d, room.createdAt),
                  },
                  {
                    key: 'status',
                    header: d.adminConsole.rooms.colStatus,
                    width: '5.5rem',
                    noTruncate: true,
                    cell: (room: AdminRoomView) => (
                      <Badge tone={room.status === 'playing' ? 'win' : 'muted'}>
                        {room.status === 'playing' ? d.common.playing : d.common.waiting}
                      </Badge>
                    ),
                  },
                  {
                    key: 'action',
                    header: d.adminConsole.rooms.colAction,
                    width: '7rem',
                    align: 'end',
                    noTruncate: true,
                    cell: closeButton,
                  },
                ]}
                rows={visibleRooms}
                rowKey={(room) => room.id}
              />
            </div>
            <ul className="space-y-2 lg:hidden">
              {visibleRooms.map((room) => (
                <li
                  key={room.id}
                  className="flex h-16 items-center justify-between gap-3 rounded-xl bg-inset px-3"
                >
                  <SelectBox
                    checked={selection.isSelected(room.id)}
                    disabled={isPending}
                    onChange={() => selection.toggle(room.id)}
                    label={format(d.adminConsole.rooms.selectRowAria, { code: room.code })}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5">
                      <span className="shrink-0 font-mono tracking-widest">{room.code}</span>
                      <span className="truncate font-bold">{room.name}</span>
                      <Badge tone={GAME_BADGE_TONE[room.gameType]}>{d.games[room.gameType]}</Badge>
                    </p>
                    <p className="truncate text-xs text-muted">
                      {format(d.adminConsole.rooms.meta, {
                        host: room.hostName,
                        members: room.memberCount,
                        age: formatAge(d, room.createdAt),
                      })}
                      {room.status === 'playing' ? d.adminConsole.rooms.playingSuffix : ''}
                    </p>
                  </div>
                  <div className="shrink-0">{closeButton(room)}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {pageState.total > 0 ? (
        <div className="flex shrink-0 items-center justify-between gap-2">
          <Button
            size="sm"
            variant="surface"
            disabled={isPending || visibleRooms.length === 0}
            onClick={() => selection.toggleAll(visibleRooms)}
            className="lg:invisible"
          >
            {selectionStateForPage === 'all'
              ? d.adminConsole.rooms.clearSelection
              : d.adminConsole.rooms.selectPage}
          </Button>
          <Pager
            page={page}
            pageCount={pageCount}
            from={pageStart}
            to={pageEnd}
            total={pageState.total}
            onPage={setPage}
          />
        </div>
      ) : null}

      <ConfirmDialog
        open={closeTarget !== null}
        title={format(d.adminConsole.rooms.closeTitle, {
          code: closeTarget?.code ?? '',
          name: closeTarget?.name ?? '',
        })}
        body={format(d.adminConsole.rooms.closeBody, { members: closeTarget?.memberCount ?? 0 })}
        confirmLabel={d.adminConsole.rooms.close}
        tone="danger"
        onConfirm={() => {
          const target = closeTarget
          setCloseTarget(null)
          if (!target) return
          setPendingId(target.id)
          startTransition(async () => {
            const result = await adminCloseRoom(target.id)
            setPendingId(null)
            if (result.success) {
              toast(d.adminConsole.rooms.closedToast, 'success')
              setRefreshKey((current) => current + 1)
              onDataChanged()
            } else {
              toast(translateError(d, result.error), 'error')
            }
          })
        }}
        onClose={() => setCloseTarget(null)}
      />

      <ConfirmDialog
        open={bulkOpen}
        title={format(d.adminConsole.rooms.bulkCloseTitle, { n: selection.count })}
        body={d.adminConsole.rooms.bulkCloseBody}
        confirmLabel={format(d.adminConsole.rooms.bulkClose, { n: selection.count })}
        tone="danger"
        onConfirm={runBulkClose}
        onClose={() => setBulkOpen(false)}
      />
    </Panel>
  )
}
