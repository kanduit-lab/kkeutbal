import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { useFitCount, usePagedRows, type PagedRows } from '@/components/ui/paged'
import { ResizeObserverStub } from './setup'

/**
 * `usePagedRows`/`useFitCount`(src/components/ui/paged.tsx)를 실제로 렌더링해 검증한다.
 * 이전 `test/unit/paged-pagination.test.ts`는 훅을 렌더링 컨텍스트 밖에서 부를 수 없어서
 * 계산 로직을 복사해 재현했다 — 제품 코드가 바뀌어도 조용히 어긋나지 않는 이 파일로 대체한다.
 *
 * ## clientHeight를 고정하는 방법
 * jsdom은 레이아웃을 계산하지 않아 모든 엘리먼트의 `clientHeight`가 0이다. `useFitCount`의
 * `useLayoutEffect`가 `areaRef.current.clientHeight`를 읽기 *전에* 값을 심어야 하므로,
 * React가 ref를 커밋하는 시점(레이아웃 이펙트보다 항상 먼저 온다)에 콜백 ref 안에서
 * `Object.defineProperty`로 고정한다 — 렌더 이후에 assign하면 이미 늦다.
 *
 * ## 훅의 반환값을 읽는 방법
 * `renderHook`은 실제 DOM 엘리먼트를 그리지 않아 `areaRef`를 붙일 대상이 없다(`area가 null`이라
 * `measure()`가 조기 return해 계산이 아예 안 된다). 그래서 직접 그리는 작은 하네스 컴포넌트를
 * 만들고, 매 렌더마다 `useEffect`로 최신 훅 반환값을 테스트 쪽 변수에 흘려보낸다.
 */

afterEach(() => {
  cleanup()
  ResizeObserverStub.instances.length = 0
})

function FitCountHarness({
  height,
  onResult,
  ...opts
}: {
  height: number
  onResult: (result: { count: number }) => void
  rowHeight: number
  reserve?: number
  min?: number
  max?: number
}) {
  const result = useFitCount(opts)
  useEffect(() => {
    onResult(result)
  })
  return (
    <div
      ref={(node) => {
        result.areaRef.current = node
        if (node) Object.defineProperty(node, 'clientHeight', { value: height, configurable: true })
      }}
    />
  )
}

describe('useFitCount 실제 렌더링', () => {
  it('영역 높이를 줄 높이로 나눠 내림한다 (헤더 32px 뺀 나머지를 52px 줄로)', () => {
    let latest: { count: number } | undefined
    render(
      <FitCountHarness height={500} rowHeight={52} reserve={32} onResult={(r) => (latest = r)} />,
    )
    expect(latest?.count).toBe(9)
  })

  it('영역이 reserve보다 작거나 같으면 count가 이전 값(min)에서 안 바뀐다', () => {
    let latest: { count: number } | undefined
    render(
      <FitCountHarness height={32} rowHeight={52} reserve={32} onResult={(r) => (latest = r)} />,
    )
    // measure()가 height<=0에서 조기 return하므로 초기값(min 기본 1)이 그대로 유지된다.
    expect(latest?.count).toBe(1)
  })

  it('min/max 사이로 자른다', () => {
    let overMax: { count: number } | undefined
    render(
      <FitCountHarness
        height={1000}
        rowHeight={10}
        min={1}
        max={5}
        onResult={(r) => (overMax = r)}
      />,
    )
    expect(overMax?.count).toBe(5)

    let underMin: { count: number } | undefined
    render(
      <FitCountHarness
        height={15}
        rowHeight={52}
        min={3}
        max={200}
        onResult={(r) => (underMin = r)}
      />,
    )
    expect(underMin?.count).toBe(3)
  })

  it('ResizeObserver 콜백이 오면 다시 측정한다 (jsdom은 자동 발화가 없어 직접 트리거)', () => {
    let latest: { count: number } | undefined
    const { container } = render(
      <FitCountHarness height={100} rowHeight={20} onResult={(r) => (latest = r)} />,
    )
    expect(latest?.count).toBe(5)

    const area = container.firstElementChild as HTMLDivElement
    Object.defineProperty(area, 'clientHeight', { value: 200, configurable: true })
    const observer = ResizeObserverStub.instances.at(-1)
    expect(observer).toBeDefined()
    act(() => observer!.fire())

    expect(latest?.count).toBe(10)
  })
})

function PagedHarness({
  height,
  onResult,
  ...opts
}: {
  height: number
  onResult: (result: PagedRows<number>) => void
  items: readonly number[]
  rowHeight: number
  reserve?: number
  minRows?: number
  resetKey?: string
}) {
  const result = usePagedRows(opts)
  useEffect(() => {
    onResult(result)
  })
  return (
    <div
      ref={(node) => {
        result.areaRef.current = node
        if (node) Object.defineProperty(node, 'clientHeight', { value: height, configurable: true })
      }}
    >
      <button type="button" onClick={() => result.setPage(result.page + 1)}>
        next
      </button>
      <button type="button" onClick={() => result.setPage(99)}>
        jump-far
      </button>
    </div>
  )
}

const RANGE_25 = Array.from({ length: 25 }, (_, i) => i)

describe('usePagedRows 실제 렌더링', () => {
  it('아이템이 없으면 1페이지 취급하고 from은 0이다 (1-based가 아니라 빈 상태 표시)', () => {
    let latest: PagedRows<number> | undefined
    render(
      <PagedHarness items={[]} rowHeight={20} height={200} onResult={(r) => (latest = r)} />,
    )
    expect(latest).toMatchObject({ pageCount: 1, page: 0, from: 0, to: 0, total: 0, rows: [] })
  })

  it('요청한 페이지가 범위 안이면 1-based from/to로 잘라낸다', () => {
    let latest: PagedRows<number> | undefined
    render(
      <PagedHarness
        items={RANGE_25}
        rowHeight={20}
        height={200}
        onResult={(r) => (latest = r)}
      />,
    )
    // areaHeight 200 / rowHeight 20 = perPage 10
    expect(latest?.perPage).toBe(10)
    expect(latest?.pageCount).toBe(3)
    expect(latest?.from).toBe(1)
    expect(latest?.to).toBe(10)
    expect(latest?.rows).toEqual(RANGE_25.slice(0, 10))
  })

  it('요청한 페이지가 넘치면 마지막 페이지로 클램프한다', () => {
    let latest: PagedRows<number> | undefined
    const { getByText } = render(
      <PagedHarness
        items={RANGE_25}
        rowHeight={20}
        height={200}
        onResult={(r) => (latest = r)}
      />,
    )
    fireEvent.click(getByText('jump-far')) // setPage(99) 요청

    expect(latest?.page).toBe(2) // pageCount(3) - 1
    expect(latest?.from).toBe(21)
    expect(latest?.to).toBe(25)
    expect(latest?.rows).toEqual(RANGE_25.slice(20, 25))
  })

  it('perPage로 나누어떨어지지 않아도 마지막 페이지가 잘리지 않는다', () => {
    let latest: PagedRows<number> | undefined
    const items = Array.from({ length: 22 }, (_, i) => i)
    const { getByText } = render(
      <PagedHarness items={items} rowHeight={20} height={200} onResult={(r) => (latest = r)} />,
    )
    const next = getByText('next')
    fireEvent.click(next) // page 1
    fireEvent.click(next) // page 2 (마지막)

    expect(latest?.rows).toHaveLength(2)
    expect(latest?.to).toBe(22)
  })

  it('resetKey가 바뀌면 1페이지로 되돌아간다', () => {
    let latest: PagedRows<number> | undefined
    const { getByText, rerender } = render(
      <PagedHarness
        items={RANGE_25}
        rowHeight={20}
        height={200}
        resetKey="검색어"
        onResult={(r) => (latest = r)}
      />,
    )
    fireEvent.click(getByText('jump-far'))
    expect(latest?.page).toBe(2)

    rerender(
      <PagedHarness
        items={RANGE_25}
        rowHeight={20}
        height={200}
        resetKey="다른 검색어"
        onResult={(r) => (latest = r)}
      />,
    )
    expect(latest?.page).toBe(0)
  })

  it('아이템이 줄어들면 setPage 없이도 다음 렌더에서 마지막 페이지로 클램프된다', () => {
    let latest: PagedRows<number> | undefined
    const { getByText, rerender } = render(
      <PagedHarness
        items={RANGE_25}
        rowHeight={20}
        height={200}
        onResult={(r) => (latest = r)}
      />,
    )
    fireEvent.click(getByText('jump-far'))
    expect(latest?.page).toBe(2) // from 21-25

    const shrunk = Array.from({ length: 12 }, (_, i) => i)
    rerender(
      <PagedHarness items={shrunk} rowHeight={20} height={200} onResult={(r) => (latest = r)} />,
    )
    // perPage 10, pageCount = ceil(12/10) = 2 → page(2) clamp to 1
    expect(latest?.page).toBe(1)
    expect(latest?.from).toBe(11)
    expect(latest?.to).toBe(12)
  })
})
