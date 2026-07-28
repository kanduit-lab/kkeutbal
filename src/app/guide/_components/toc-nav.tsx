import { Panel } from '@/components/ui'
import { getDict } from '@/lib/i18n/server'

export async function TocNav({ items }: { items: readonly { href: string; label: string }[] }) {
  const { d } = await getDict()

  return (
    <nav aria-label={d.guide.tocTitle} className="min-w-0 lg:sticky lg:top-6">
      <h2 className="sr-only">{d.guide.tocTitle}</h2>
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:hidden">
        {items.map((item) => (
          <li key={item.href} className="shrink-0">
            <a
              href={item.href}
              className="inline-flex min-h-11 items-center rounded-xl border border-white/10 bg-surface-raised px-3 text-sm font-semibold text-muted transition-colors hover:border-white/25 hover:text-text"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
      <Panel className="hidden lg:block">
        <p aria-hidden className="mb-2 px-1 text-xs font-bold tracking-wider text-muted">
          {d.guide.tocTitle}
        </p>
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-surface-raised hover:text-text"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </Panel>
    </nav>
  )
}