'use client'

import { useFitCount } from '@/components/ui'

export interface RankContextWindow<T> {
  readonly areaRef: React.RefObject<HTMLDivElement | null>
  readonly rows: readonly T[]
  readonly aboveCount: number
  readonly belowCount: number
}

/**
 * 전체 순위표에서 현재 족보를 중심으로, 뷰포트에 들어가는 만큼만 위아래로 잘라 보여준다.
 * `currentIndex`가 없으면(카드 미선택) 표 맨 위(최상위 족보)부터 보여준다.
 * 전체 개수가 뷰포트에 다 들어가면 잘림 없이 전체가 그대로 보인다.
 */
export function useRankContextWindow<T>({
  items,
  currentIndex,
  rowHeight,
  minRows = 3,
}: {
  items: readonly T[]
  currentIndex: number | null
  rowHeight: number
  minRows?: number
}): RankContextWindow<T> {
  const { areaRef, count } = useFitCount({ rowHeight, min: minRows })
  const total = items.length

  const maxStart = Math.max(0, total - count)
  const centered = currentIndex === null ? 0 : currentIndex - Math.floor((count - 1) / 2)
  const start = Math.min(maxStart, Math.max(0, centered))
  const rows = items.slice(start, start + count)

  return {
    areaRef,
    rows,
    aboveCount: start,
    belowCount: Math.max(0, total - (start + rows.length)),
  }
}
