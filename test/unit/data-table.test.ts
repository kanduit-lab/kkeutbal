import { describe, expect, it } from 'vitest'
import type { ReactElement } from 'react'
import {
  DataTable,
  DATA_TABLE_HEADER_H,
  DATA_TABLE_ROW_H,
  type DataColumn,
} from '@/components/ui/data-table'

/**
 * `DataTable`은 훅을 쓰지 않는 순수 함수 컴포넌트라 렌더링 라이브러리 없이도 직접 호출해
 * 실제 프로덕트 코드를 검증할 수 있다 — 함수를 부르면 React 엘리먼트 트리(순수 JS 객체)만
 * 돌아오고 DOM은 전혀 필요 없다. `usePagedRows`처럼 훅을 쓰는 쪽은 이 방식이 안 통한다
 * (React 렌더 컨텍스트 밖에서 훅을 부르면 "Invalid hook call"이 난다) — 그쪽은
 * `paged-pagination.test.ts`에서 순수 계산만 재현해 검증한다.
 *
 * `test/dom/**`에 jsdom + `@testing-library/react`(`renderHook`)가 준비되면, 이 파일이
 * 검증하는 트리 구조를 실제 렌더링 스냅샷으로 대체하는 편이 더 강한 보증이다.
 */

interface Row {
  readonly id: string
  readonly name: string
  readonly amount: number
}

const ROWS: readonly Row[] = [
  { id: 'a', name: '앨리스', amount: 100 },
  { id: 'b', name: '밥', amount: -50 },
]

function findByType<P>(children: unknown, type: string): ReactElement<P> | undefined {
  const list = Array.isArray(children) ? children : [children]
  return list.find(
    (child): child is ReactElement<P> =>
      Boolean(child) && typeof child === 'object' && (child as ReactElement).type === type,
  )
}

function renderTable(columns: readonly DataColumn<Row>[], rows: readonly Row[] = ROWS) {
  const element = DataTable({
    label: '테스트 표',
    columns,
    rows,
    rowKey: (row) => row.id,
  }) as ReactElement<{ children: unknown; className?: string }>
  return element
}

describe('DataTable', () => {
  it('페이지 계산용 상수가 마크업의 h-8/h-12와 어긋나지 않는다', () => {
    // usePagedRows(reserve)에 넘기는 값과 실제 <thead> h-8(32px)이 어긋나면 마지막 줄이
    // 잘리거나 빈 줄이 남는다. docs/12-handoff.md 11번 "줄 높이를 바꿀 때" 참고.
    expect(DATA_TABLE_HEADER_H).toBe(32)
    // 한 줄 h-12(48px)보다 여유 있게 잡는다는 주석의 의도를 그대로 확인한다.
    expect(DATA_TABLE_ROW_H).toBeGreaterThan(48)
  })

  it('<table>이 table-fixed와 전달한 className을 함께 갖는다', () => {
    const table = renderTable([{ key: 'name', header: '이름', cell: (row) => row.name }])
    expect(table.type).toBe('table')
    expect(table.props.className).toContain('table-fixed')
  })

  it('열마다 <col>을 만들고 width가 지정된 열만 style을 채운다', () => {
    const table = renderTable([
      { key: 'name', header: '이름', width: '40%', cell: (row) => row.name },
      { key: 'amount', header: '금액', cell: (row) => row.amount },
    ])
    const colgroup = findByType<{ children: unknown }>(table.props.children, 'colgroup')!
    const cols = colgroup.props.children as ReactElement<{ style?: { width?: string } }>[]

    expect(cols).toHaveLength(2)
    expect(cols[0]!.props.style).toEqual({ width: '40%' })
    expect(cols[1]!.props.style).toBeUndefined()
  })

  it('정렬을 지정하지 않은 열은 start로 기본값을 쓰고, 지정한 열은 그대로 따른다', () => {
    const table = renderTable([
      { key: 'name', header: '이름', cell: (row) => row.name },
      { key: 'amount', header: '금액', align: 'end', cell: (row) => row.amount },
    ])
    const thead = findByType<{ children: unknown }>(table.props.children, 'thead')!
    const headerRow = thead.props.children as ReactElement<{
      children: ReactElement<{ className?: string }>[]
    }>
    const headerCells = headerRow.props.children

    expect(headerCells[0]!.props.className).toContain('text-start')
    expect(headerCells[1]!.props.className).toContain('text-end')
  })

  it('rowHighlight가 참인 행에만 강조 클래스를 붙인다', () => {
    const table = renderTable(
      [{ key: 'name', header: '이름', cell: (row) => row.name }],
      ROWS,
    )
    const highlighted = DataTable({
      label: '테스트 표',
      columns: [{ key: 'name', header: '이름', cell: (row: Row) => row.name }],
      rows: ROWS,
      rowKey: (row: Row) => row.id,
      rowHighlight: (row: Row) => row.id === 'b',
    }) as ReactElement<{ children: unknown }>

    const tbody = findByType<{ children: unknown }>(highlighted.props.children, 'tbody')!
    const dataRows = tbody.props.children as ReactElement<{ className?: string }>[]

    expect(dataRows[0]!.props.className).not.toContain('bg-gold/10')
    expect(dataRows[1]!.props.className).toContain('bg-gold/10')

    // 강조를 아예 넘기지 않은 원래 table은 아무 행도 강조되지 않는다.
    const plainTbody = findByType<{ children: unknown }>(table.props.children, 'tbody')!
    const plainRows = plainTbody.props.children as ReactElement<{ className?: string }>[]
    for (const row of plainRows) {
      expect(row.props.className).not.toContain('bg-gold/10')
    }
  })

  it('noTruncate가 없는 칸은 truncate, 있는 칸은 whitespace-nowrap을 쓴다', () => {
    const table = renderTable([
      { key: 'name', header: '이름', cell: (row) => row.name },
      { key: 'amount', header: '금액', noTruncate: true, cell: (row) => row.amount },
    ])
    const tbody = findByType<{ children: unknown }>(table.props.children, 'tbody')!
    const firstRow = (tbody.props.children as ReactElement<{ children: unknown }>[])[0]!
    const cells = firstRow.props.children as ReactElement<{ className?: string }>[]

    expect(cells[0]!.props.className).toContain('truncate')
    expect(cells[0]!.props.className).not.toContain('whitespace-nowrap')
    expect(cells[1]!.props.className).toContain('whitespace-nowrap')
    expect(cells[1]!.props.className).not.toContain('truncate')
  })

  it('rows가 비면 <tbody>에 자식이 없다', () => {
    const table = renderTable([{ key: 'name', header: '이름', cell: (row) => row.name }], [])
    const tbody = findByType<{ children: unknown }>(table.props.children, 'tbody')!
    expect(tbody.props.children).toEqual([])
  })
})
