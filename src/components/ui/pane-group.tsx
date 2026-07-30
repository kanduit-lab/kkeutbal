'use client'

import { clsx } from 'clsx'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Segmented } from './segmented'
import { useIsDesktop } from './use-media-query'

const TAB_COLUMNS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
}

export interface Pane {
  readonly key: string
  readonly label: string
  readonly node: ReactNode
}

/**
 * 한 영역의 패널 묶음. 데스크톱은 나란히, 모바일은 탭으로 하나씩 —
 * 어느 쪽도 페이지를 세로로 늘리지 않는다.
 */
export function PaneGroup({
  panes,
  columns = 'lg:grid-cols-2',
  ariaLabel,
  activeKey: controlledKey,
  onActiveKeyChange,
}: {
  panes: readonly Pane[]
  /** 데스크톱 열 구성. 기본은 반반 */
  columns?: string
  ariaLabel: string
  /**
   * 모바일 탭을 부모가 제어할 때 쓴다. 사진 인식처럼 화면 밖 사건으로
   * 다른 패널을 보여줘야 하는 경우가 있다. 생략하면 내부 상태로 동작한다.
   */
  activeKey?: string
  onActiveKeyChange?: (key: string) => void
}) {
  const isDesktop = useIsDesktop()
  const [uncontrolledKey, setUncontrolledKey] = useState(panes[0]?.key ?? '')
  const activeKey = controlledKey ?? uncontrolledKey
  const setActiveKey = (key: string) => {
    if (controlledKey === undefined) setUncontrolledKey(key)
    onActiveKeyChange?.(key)
  }

  if (isDesktop) {
    return (
      <div className={clsx('grid min-h-0 flex-1 items-stretch gap-4', columns)}>
        {panes.map((pane) => (
          <div key={pane.key} className="flex min-h-0 flex-col">
            {pane.node}
          </div>
        ))}
      </div>
    )
  }

  const active = panes.find((pane) => pane.key === activeKey) ?? panes[0]
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {panes.length > 1 ? (
        <Segmented
          ariaLabel={ariaLabel}
          size="sm"
          className={clsx('shrink-0', TAB_COLUMNS[panes.length] ?? 'grid-cols-2')}
          value={activeKey}
          onChange={setActiveKey}
          options={panes.map((pane) => ({ value: pane.key, label: pane.label }))}
        />
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col">{active?.node}</div>
    </div>
  )
}
