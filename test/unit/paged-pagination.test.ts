import { describe, expect, it } from 'vitest'

/**
 * `usePagedRows`/`useFitCount`(src/components/ui/paged.tsx)는 훅이라 렌더링 컨텍스트 밖에서
 * 직접 부를 수 없다("Invalid hook call"). `data-table.test.ts`가 쓰는 "함수를 직접 호출해
 * 실제 코드를 검증" 방식이 여기서는 통하지 않아, 순수 계산 부분만 그대로 옮겨 적어
 * 재현(reproduce)했다 — 실제 훅 코드가 아니다.
 *
 * 주의: `src/components/ui/paged.tsx`의 계산 로직이 바뀌면 이 파일도 함께 갱신해야 한다.
 * 이건 임시 대체물이다 — `test/dom/**`에 jsdom + `@testing-library/react`(`renderHook`)가
 * 준비되면 실제 훅을 렌더링해 검증하는 테스트로 바꿔야 한다
 * (TODO.md "Low — 회귀 가드 / 역할별 렌더링 검증" 참고).
 */

// paged.tsx:28-44 useFitCount의 measure() 그대로.
function computeFitCount({
  areaHeight,
  rowHeight,
  reserve = 0,
  min = 1,
  max = 200,
}: {
  areaHeight: number
  rowHeight: number
  reserve?: number
  min?: number
  max?: number
}): number | null {
  const height = areaHeight - reserve
  if (height <= 0) return null // measure()가 조기 return — count는 이전 값 그대로 유지된다
  const fits = Math.floor(height / rowHeight)
  return Math.max(min, Math.min(max, fits))
}

// paged.tsx:84-89 usePagedRows 본문 중 렌더 시점 계산 그대로.
function computePage<T>({
  items,
  perPage,
  requestedPage,
}: {
  items: readonly T[]
  perPage: number
  requestedPage: number
}) {
  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / perPage))
  const page = Math.min(requestedPage, pageCount - 1)
  const from = page * perPage
  const rows = items.slice(from, from + perPage)

  return {
    rows,
    page,
    pageCount,
    perPage,
    from: total === 0 ? 0 : from + 1,
    to: from + rows.length,
    total,
  }
}

// paged.tsx:79-82 "검색·필터가 바뀌면 렌더 중에 첫 페이지로 되돌린다"의 렌더 시점 되돌림.
interface PagedState {
  readonly page: number
  readonly resetKey: string
}

function applyResetKey(current: PagedState, resetKey: string): PagedState {
  if (current.resetKey !== resetKey) return { page: 0, resetKey }
  return current
}

describe('useFitCount 계산 (재현)', () => {
  it('영역 높이를 줄 높이로 나눠 내림한다', () => {
    // 표 한 화면: 헤더 32px 뺀 나머지를 52px 줄로 나눈다 (DataTable 상수와 짝을 이루는 값).
    expect(computeFitCount({ areaHeight: 500, rowHeight: 52, reserve: 32 })).toBe(9)
  })

  it('영역이 reserve보다 작거나 같으면 null — 측정 전 초기값을 건드리지 않는다', () => {
    expect(computeFitCount({ areaHeight: 20, rowHeight: 52, reserve: 32 })).toBeNull()
    expect(computeFitCount({ areaHeight: 32, rowHeight: 52, reserve: 32 })).toBeNull()
  })

  it('min/max 사이로 자른다', () => {
    expect(computeFitCount({ areaHeight: 1000, rowHeight: 10, min: 1, max: 5 })).toBe(5)
    expect(computeFitCount({ areaHeight: 15, rowHeight: 52, min: 3, max: 200 })).toBe(3)
  })
})

describe('usePagedRows 페이지 계산 (재현)', () => {
  it('아이템이 없으면 1페이지 취급하고 from은 0이다 (1-based가 아니라 빈 상태 표시)', () => {
    const result = computePage({ items: [], perPage: 10, requestedPage: 0 })
    expect(result).toMatchObject({ pageCount: 1, page: 0, from: 0, to: 0, total: 0, rows: [] })
  })

  it('요청한 페이지가 범위 안이면 1-based from/to로 잘라낸다', () => {
    const items = Array.from({ length: 25 }, (_, i) => i)
    const result = computePage({ items, perPage: 10, requestedPage: 0 })
    expect(result.pageCount).toBe(3)
    expect(result.from).toBe(1)
    expect(result.to).toBe(10)
    expect(result.rows).toEqual(items.slice(0, 10))
  })

  it('요청한 페이지가 넘치면 마지막 페이지로 클램프한다', () => {
    const items = Array.from({ length: 25 }, (_, i) => i)
    const result = computePage({ items, perPage: 10, requestedPage: 99 })
    expect(result.page).toBe(2) // pageCount(3) - 1
    expect(result.from).toBe(21)
    expect(result.to).toBe(25)
    expect(result.rows).toEqual(items.slice(20, 25))
  })

  it('perPage로 나누어떨어지지 않아도 마지막 페이지가 잘리지 않는다', () => {
    const items = Array.from({ length: 22 }, (_, i) => i)
    const result = computePage({ items, perPage: 10, requestedPage: 2 })
    expect(result.rows).toHaveLength(2)
    expect(result.to).toBe(22)
  })
})

describe('resetKey 변경 시 페이지 되돌림 (재현)', () => {
  it('resetKey가 같으면 현재 페이지를 유지한다', () => {
    const current: PagedState = { page: 2, resetKey: '검색어' }
    expect(applyResetKey(current, '검색어')).toEqual(current)
  })

  it('resetKey가 바뀌면 1페이지(0-index)로 되돌아간다', () => {
    const current: PagedState = { page: 2, resetKey: '검색어' }
    expect(applyResetKey(current, '다른 검색어')).toEqual({ page: 0, resetKey: '다른 검색어' })
  })
})
