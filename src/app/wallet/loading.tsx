import { FixedPage, Panel, Skeleton, SkeletonPanel } from '@/components/ui'
import { getDict } from '@/lib/i18n/server'

export default async function Loading() {
  const { d } = await getDict()
  return (
    <FixedPage width="content">
      <div role="status" aria-live="polite">
        <span className="sr-only">{d.loading.wallet}</span>
      </div>
      <header className="mb-3 flex shrink-0 items-start gap-3">
        <Skeleton className="size-11" radius="xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
      </header>
      <div className="mb-3 grid shrink-0 grid-cols-3 gap-2">
        <SkeletonPanel className="h-20" />
        <SkeletonPanel className="h-20" />
        <SkeletonPanel className="h-20" />
      </div>
      <Panel className="flex min-h-0 flex-1 flex-col gap-2">
        <Skeleton className="h-5 w-24 shrink-0" />
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-16 shrink-0" radius="xl" />
        ))}
      </Panel>
    </FixedPage>
  )
}
