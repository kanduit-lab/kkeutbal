import { Panel } from '@/components/ui'

/** 섹션 앵커 목차. 순수 앵커 링크라 클라이언트 상태가 필요 없다. */
export function TocNav({ items }: { items: readonly { href: string; label: string }[] }) {
  return (
    <Panel className="lg:sticky lg:top-6">
      <p className="mb-2 px-1 text-xs font-bold tracking-wider text-muted uppercase">목차</p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.href}>
            <a
              href={item.href}
              className="block rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-raised hover:text-text"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
