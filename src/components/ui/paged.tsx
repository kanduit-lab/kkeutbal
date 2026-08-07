'use client'

import { clsx } from 'clsx'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Button } from './button'
import { format, useDict } from '@/lib/i18n/client'

/**
 * 높이가 부모에 의해 정해진 영역에 몇 줄이 들어가는지 센다.
 * 영역 자체가 `min-h-0 overflow-hidden`이라 자식 수가 늘어도 높이가 변하지 않는다 —
 * 그래서 측정이 되먹임 루프를 만들지 않는다.
 */
export function useFitCount({
  rowHeight,
  reserve = 0,
  min = 1,
  max = 200,
}: {
  rowHeight: number
  /** 표 머리글처럼 줄이 아닌 고정 높이(px). 나누기 전에 뺀다 */
  reserve?: number
  min?: number
  max?: number
}): { areaRef: React.RefObject<HTMLDivElement | null>; count: number } {
  const areaRef = useRef<HTMLDivElement | null>(null)
  const [count, setCount] = useState(min)

  useLayoutEffect(() => {
    const area = areaRef.current
    if (!area) return

    function measure() {
      const height = (area?.clientHeight ?? 0) - reserve
      if (height <= 0) return
      const fits = Math.floor(height / rowHeight)
      const next = Math.max(min, Math.min(max, fits))
      setCount((current) => (current === next ? current : next))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(area)
    return () => observer.disconnect()
  }, [rowHeight, reserve, min, max])

  return { areaRef, count }
}

/**
 * `Panel`(p-5) 상하 패딩 40 + `gap-2` 8 + `Pager` 한 줄 28.
 * 목록 패널에서 줄이 들어갈 영역 **밖으로** 나가는 고정 높이다.
 */
const LIST_PANEL_CHROME_H = 76

/**
 * 목록 패널이 한 줄도 온전히 못 그리는 높이까지 눌리지 않게 하는 최소 높이(px).
 *
 * `useFitCount`는 `min: 1` 때문에 영역이 한 줄보다 짧아도 1을 돌려준다. 줄을 0개 그리는
 * 것보다는 낫지만, 영역이 `overflow-hidden`이라 그 한 줄은 **글자 중간에서 가로로 잘린
 * 채** 보인다 — 세션 결과 화면에서 실제로 그렇게 잘려 있었다(영역 53px, 표 81px). 높이를
 * 나눠 갖는 쪽이 어떤 비율을 고르든 이 바닥은 지켜져야 잘린 줄이 나오지 않는다.
 */
export function listPanelMinHeight(rowHeight: number, reserve = 0): number {
  return LIST_PANEL_CHROME_H + reserve + rowHeight
}

/** `EmptyState`(p-8 + 제목·힌트 두 줄)의 실측 높이. 목록이 비었을 때의 상한 계산에 쓴다. */
const EMPTY_STATE_H = 132

/**
 * `PanelHeader`(제목 + 선택적 설명 줄)와 그 아래 간격을 넉넉히 잡은 값.
 * `LIST_PANEL_CHROME_H`에는 머리글이 빠져 있어서 상한 계산에는 이걸 따로 더한다.
 */
const PANEL_HEADER_ALLOWANCE = 64

export interface PagedRows<T> {
  readonly areaRef: React.RefObject<HTMLDivElement | null>
  readonly rows: readonly T[]
  readonly page: number
  readonly pageCount: number
  readonly perPage: number
  readonly from: number
  readonly to: number
  readonly total: number
  readonly setPage: (next: number) => void

  /**
   * 패널이 내용보다 커지지 않게 막는 상한(px). `Panel`의 `style={{ maxHeight }}`에 넣는다.
   *
   * 없으면 목록이 0건이어도 패널이 뷰포트 높이를 통째로 차지해 거대한 빈 상자가 된다.
   * 값이 **`items.length`에서만** 나오는 것이 핵심이다 — 측정 결과인 `perPage`를 참조하면
   * 높이 → 줄 수 → 높이로 도는 되먹임 루프가 생긴다. 상한이 실제 남은 높이보다 크면
   * `flex-1`이 그대로 이기므로, 내용이 넉넉할 때의 동작은 예전과 같다.
   *
   * **줄 수에 따라 나타났다 사라지는 요소가 패널 안에 있으면 쓰지 않는다.** 회원·방 목록이
   * 그렇다 — "검색 결과 N개 전체 선택" 버튼이 `filtered.length > rows.length`일 때만 뜨는데,
   * 상한이 줄을 하나 깎으면 그 버튼이 생기고, 그만큼 chrome이 늘어 줄이 또 깎인다.
   * 실제로 회원 3명이 3페이지가 됐다. 그 둘은 예전처럼 남은 높이를 다 쓴다.
   */
  readonly maxPanelHeight: number
}

/**
 * 뷰포트에 들어가는 만큼만 잘라서 보여준다. 스크롤 대신 페이지로 넘긴다.
 * `resetKey`(검색어·필터 등)가 바뀌면 첫 페이지로 돌아간다.
 */
export function usePagedRows<T>({
  items,
  rowHeight,
  reserve = 0,
  minRows = 1,
  resetKey = '',
  chrome = 0,
}: {
  items: readonly T[]
  rowHeight: number
  reserve?: number
  minRows?: number
  resetKey?: string
  /**
   * 줄 영역 **밖에** 있는 이 패널만의 추가 높이(px) — 검색 툴바, 일괄 선택 막대 등.
   *
   * **넉넉하게 잡는다.** 남는 쪽은 패널 아래 여백이 조금 생기는 것으로 끝나지만, 모자라면
   * 상한이 줄 영역을 파먹어 다 들어갈 목록이 여러 페이지로 쪼개진다. 실제로 회원 3명이
   * 3페이지가 됐고, 그때 뜬 "전체 선택" 버튼이 chrome을 더 키워 악화시켰다.
   */
  chrome?: number
}): PagedRows<T> {
  const { areaRef, count: perPage } = useFitCount({ rowHeight, reserve, min: minRows })
  const [state, setState] = useState({ page: 0, resetKey })

  // 검색·필터가 바뀌면 렌더 중에 첫 페이지로 되돌린다 (effect보다 깜빡임이 없다).
  if (state.resetKey !== resetKey) setState({ page: 0, resetKey })

  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / perPage))
  const page = Math.min(state.page, pageCount - 1)
  const from = page * perPage
  const rows = items.slice(from, from + perPage)

  const setPage = useCallback(
    (next: number) => setState((current) => ({ ...current, page: Math.max(0, next) })),
    [],
  )

  return {
    areaRef,
    rows,
    page,
    pageCount,
    perPage,
    from: total === 0 ? 0 : from + 1,
    to: from + rows.length,
    total,
    setPage,
    maxPanelHeight:
      LIST_PANEL_CHROME_H +
      PANEL_HEADER_ALLOWANCE +
      chrome +
      reserve +
      (total === 0 ? EMPTY_STATE_H : total * rowHeight),
  }
}

/** 페이지 이동 컨트롤. 페이지가 하나뿐이면 개수만 알린다. */
export function Pager({
  page,
  pageCount,
  from,
  to,
  total,
  onPage,
  className,
}: {
  page: number
  pageCount: number
  from: number
  to: number
  total: number
  onPage: (next: number) => void
  className?: string
}) {
  const { d } = useDict()
  const range = format(d.common.pager.range, { from, to, total })

  return (
    <div
      className={clsx('flex shrink-0 items-center justify-between gap-2 pt-2', className)}
      role="group"
      aria-label={d.common.pager.navLabel}
    >
      <p className="text-xs font-medium tabular-nums text-muted">{range}</p>
      {pageCount > 1 ? (
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="px-3"
            disabled={page === 0}
            aria-label={d.common.pager.prev}
            onClick={() => onPage(page - 1)}
          >
            ‹
          </Button>
          <p aria-live="polite" className="min-w-16 text-center text-xs font-bold tabular-nums">
            {format(d.common.pager.status, { page: page + 1, total: pageCount })}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="px-3"
            disabled={page >= pageCount - 1}
            aria-label={d.common.pager.next}
            onClick={() => onPage(page + 1)}
          >
            ›
          </Button>
        </div>
      ) : null}
    </div>
  )
}
