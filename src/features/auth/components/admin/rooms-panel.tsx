'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Input,
  Select,
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
import { GAME_BADGE_TONE } from '@/features/game/components/shared'
import { format, translateError, useDict } from '@/lib/i18n/client'
import { adminCloseRoom, adminCloseRooms } from '../../admin-actions'
import type { AdminBulkFailure, AdminRoomView } from '../../admin-queries'
import { formatAge } from './format'
import {
  EMPTY_ROOM_QUERY,
  filterRooms,
  isRoomQueryActive,
  roomQueryKey,
  type RoomQuery,
  type RoomStatusFilter,
} from './rooms-filter'
import { SelectBox } from './select-box'
import { selectionState, useRowSelection } from './use-row-selection'

const STATUS_FILTERS: readonly RoomStatusFilter[] = ['all', 'waiting', 'playing']

/** 모바일 한 줄 높이(px) — `h-16` + `space-y-2` 간격 */
const ROW_H = 72


/**
 * 검색 툴바 등 줄 영역 밖 높이. 데스크톱 실측 chrome은 200px이고 `paged.tsx`가 이미 140을
 * 잡으므로 순수 여유분은 60이면 맞다. 그보다 크게 두는 이유는 두 가지다 — 좁은 화면에서
 * 툴바가 세로로 쌓여 ~56px 더 커지고, 모자랄 때의 대가가 크다(상한이 줄을 깎으면
 * "전체 선택" 버튼이 나타나 chrome이 또 늘어 회원 3명이 3페이지가 된 적이 있다).
 * 남는 쪽은 마지막 줄 아래 여백으로 끝난다.
 */
const TOOLBAR_H = 190

export function RoomsPanel({
  rooms,
  total,
  onDataChanged,
}: {
  rooms: readonly AdminRoomView[]

  /**
   * 진행 중인 방의 실제 전체 수. 목록은 100개에서 잘리므로 이 값이 더 클 수 있다 —
   * 일괄 정산을 돌리고도 배지가 그대로면 아무 일도 안 일어난 것처럼 보이는데, 실제로는
   * 상한 뒤에 밀려 있던 방이 그 자리를 채운 것이다.
   */
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
  const isDesktop = useIsDesktop()

  // 선택은 **거른 뒤의 목록**을 기준으로 산다. 검색을 좁히면 화면에서 사라진 방은 선택에서도
  // 빠져야 한다 — 안 그러면 "E2E"로 좁혀 전체 선택한 줄 알았는데 앞서 고른 다른 방까지
  // 같이 정산된다.
  const filtered = useMemo(() => filterRooms(rooms, query), [rooms, query])
  const selection = useRowSelection(filtered)
  const paged = usePagedRows({
    items: filtered,
    rowHeight: isDesktop ? DATA_TABLE_ROW_H : ROW_H,
    reserve: isDesktop ? DATA_TABLE_HEADER_H : 0,
    resetKey: roomQueryKey(query),
  chrome: TOOLBAR_H,
  })

  // 헤더 체크박스의 범위는 **지금 보이는 페이지**다. 안 보이는 페이지까지 한 번에 고르면
  // 무엇을 정산하는지 모른 채 확인을 누르게 된다. 페이지를 넘겨가며 고른 것은 그대로 쌓인다.
  const pageState = selectionState(paged.rows, selection.selectedIds)

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
    <Panel
      style={{ maxHeight: paged.maxPanelHeight }}
      className="flex min-h-0 flex-1 flex-col gap-3"
    >
      <PanelHeader
        title={d.adminConsole.rooms.title}
        badge={
          <Badge tone="muted">
            {isRoomQueryActive(query)
              ? format(d.adminConsole.rooms.countFiltered, {
                  shown: filtered.length,
                  total: rooms.length,
                })
              : total > rooms.length
                ? format(d.adminConsole.rooms.countCapped, { shown: rooms.length, total })
                : format(d.common.itemCount, { n: rooms.length })}
          </Badge>
        }
      />

      <div className="flex shrink-0 flex-col gap-2 lg:flex-row lg:items-center">
        <Input
          aria-label={d.adminConsole.rooms.searchLabel}
          value={query.text}
          onChange={(event) => setQuery({ ...query, text: event.target.value })}
          placeholder={d.adminConsole.rooms.searchPlaceholder}
          maxLength={30}
          className="lg:min-w-0 lg:flex-1"
        />
        <div className="lg:w-32 lg:shrink-0">
          <Select
            aria-label={d.adminConsole.rooms.filterStatusLabel}
            value={query.status}
            onChange={(event) =>
              setQuery({ ...query, status: event.target.value as RoomStatusFilter })
            }
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

      {/*
        페이지 단위 헤더 체크박스만으로는 100개를 20페이지에 걸쳐 눌러야 한다. 검색으로 좁힌
        뒤 "결과 전체"를 한 번에 고르는 길을 따로 연다 — 숨은 동작이 아니라 개수를 적은
        버튼이고, 확인 다이얼로그가 다시 개수를 묻는다.
      */}
      {filtered.length > paged.rows.length ? (
        <Button
          size="sm"
          variant="surface"
          className="shrink-0"
          disabled={isPending}
          onClick={() => selection.toggleAll(filtered)}
        >
          {selection.count >= filtered.length
            ? d.adminConsole.rooms.clearSelection
            : format(d.adminConsole.rooms.selectFiltered, { n: filtered.length })}
        </Button>
      ) : null}

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

      <div ref={paged.areaRef} className="min-h-0 flex-1 overflow-hidden">
        {filtered.length === 0 ? (
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
                        checked={pageState === 'all'}
                        indeterminate={pageState === 'some'}
                        disabled={isPending}
                        onChange={() => selection.toggleAll(paged.rows)}
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
                rows={paged.rows}
                rowKey={(room) => room.id}
              />
            </div>
            <ul className="space-y-2 lg:hidden">
              {paged.rows.map((room) => (
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
      {filtered.length > 0 ? (
        <div className="flex shrink-0 items-center justify-between gap-2">
          <Button
            size="sm"
            variant="surface"
            disabled={isPending || paged.rows.length === 0}
            onClick={() => selection.toggleAll(paged.rows)}
            className="lg:invisible"
          >
            {pageState === 'all'
              ? d.adminConsole.rooms.clearSelection
              : d.adminConsole.rooms.selectPage}
          </Button>
          <Pager
            page={paged.page}
            pageCount={paged.pageCount}
            from={paged.from}
            to={paged.to}
            total={paged.total}
            onPage={paged.setPage}
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
