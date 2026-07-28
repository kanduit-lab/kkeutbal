import type { ReactNode } from 'react'
import { Panel } from '@/components/ui'
import { format, getDict } from '@/lib/i18n/server'

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