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
}: {
  items: readonly T[]
  rowHeight: number
  reserve?: number
  minRows?: number
  resetKey?: string
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
