import { FixedPage, Panel, Skeleton } from '@/components/ui'
import { getDict } from '@/lib/i18n/server'

export default async function Loading() {
  const { d } = await getDict()

  return (
    <FixedPage width="content">
      <div role="status" aria-live="polite">
        <span className="sr-only">{d.loading.ranking}</span>
      </div>
      <header className="mb-3 flex shrink-0 items-start gap-3">
        <Skeleton className="size-11 shrink-0" radius="xl" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
      </header>
      <div className="mb-3 flex shrink-0 flex-wrap gap-2">
        {['w-16', 'w-16', 'w-20', 'w-16', 'w-24', 'w-24', 'w-24'].map((width, index) => (
          <Skeleton key={index} className={`h-11 ${width}`} radius="xl" />
        ))}
      </div>
      <Panel className="flex min-h-0 flex-1 flex-col gap-2">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <Skeleton key={index} className="h-16 shrink-0" radius="xl" />
        ))}
      </Panel>
    </FixedPage>
  )
}
