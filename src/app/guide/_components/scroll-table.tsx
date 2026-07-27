import type { ReactNode } from 'react'
import { Panel } from '@/components/ui'
import { format, getDict } from '@/lib/i18n/server'

/**
 * 가로로 넘치는 표를 감싸는 스크롤 영역.
 * `overflow-x-auto` 만 걸린 컨테이너는 키보드로 스크롤할 수 없다 — 이름 있는 region 으로
 * 만들고 tabIndex 를 줘서 포커스로 좌우 스크롤이 가능하게 한다 (WCAG 2.1.1).
 */
export async function ScrollTable({ title, children }: { title: string; children: ReactNode }) {
  const { d } = await getDict()

  return (
    <Panel className="p-0">
      <div
        role="region"
        aria-label={format(d.guide.tableAria, { title })}
        tabIndex={0}
        className="overflow-x-auto rounded-2xl"
      >
        {children}
      </div>
    </Panel>
  )
}
