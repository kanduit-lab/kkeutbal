'use client'

import { clsx } from 'clsx'
import type { ReactNode } from 'react'

/** 데스크톱 전용 표 한 칸의 정의. 모바일은 각 화면이 자기 카드 레이아웃을 따로 그린다. */
export interface DataColumn<T> {
  readonly key: string
  readonly header: ReactNode
  readonly align?: 'start' | 'center' | 'end'
  /** `table-fixed` 열 너비. 지정하지 않은 열이 남은 폭을 나눠 가진다 */
  readonly width?: string
  readonly cellClassName?: string
  /** 버튼·배지가 들어가는 칸은 잘라내지 않는다 — 포커스 링이 잘리기 때문 */
  readonly noTruncate?: boolean
  readonly cell: (row: T) => ReactNode
}

const ALIGN_CLASS = {
  start: 'text-start',
  center: 'text-center',
  end: 'text-end',
} as const

/** 표 머리글이 차지하는 높이(px). `usePagedRows`의 `reserve`에 그대로 넘긴다 */
export const DATA_TABLE_HEADER_H = 32

/**
 * 페이지 계산에 쓰는 한 줄 높이(px). 마크업의 `h-12`(48)보다 조금 크게 잡는다 —
 * 버튼이 든 칸은 line box 때문에 48보다 몇 px 커질 수 있고, 넉넉하게 세면
 * 마지막 줄이 잘리는 대신 아래에 여백이 조금 남는다.
 */
export const DATA_TABLE_ROW_H = 52

export function DataTable<T>({
  label,
  columns,
  rows,
  rowKey,
  rowHighlight,
  className,
}: {
  label: string
  columns: readonly DataColumn<T>[]
  rows: readonly T[]
  rowKey: (row: T) => string
  rowHighlight?: (row: T) => boolean
  className?: string
}) {
  return (
    <table className={clsx('w-full table-fixed border-collapse text-sm', className)}>
      <caption className="sr-only">{label}</caption>
      <colgroup>
        {columns.map((column) => (
          <col key={column.key} style={column.width ? { width: column.width } : undefined} />
        ))}
      </colgroup>
      <thead>
        <tr className="h-8 border-b border-gold/20">
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
              className={clsx(
                'px-3 pb-2 align-bottom text-xs font-bold text-muted',
                ALIGN_CLASS[column.align ?? 'start'],
              )}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={rowKey(row)}
            className={clsx(
              'h-12 border-b border-white/5',
              rowHighlight?.(row) && 'bg-gold/10 ring-1 ring-inset ring-gold/25',
            )}
          >
            {columns.map((column) => (
              <td
                key={column.key}
                className={clsx(
                  'px-3 align-middle',
                  column.noTruncate ? 'whitespace-nowrap' : 'truncate',
                  ALIGN_CLASS[column.align ?? 'start'],
                  column.cellClassName,
                )}
              >
                {column.cell(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
