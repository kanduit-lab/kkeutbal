import { PageShell, Panel, Skeleton, SkeletonPanel } from '@/components/ui'
import { getDict } from '@/lib/i18n/server'

export default async function Loading() {
  const { d } = await getDict()
  return (
    <PageShell width="content">
      <div role="status" aria-live="polite">
        <span className="sr-only">{d.loading.wallet}</span>
      </div>
      <header className="mb-6 flex items-start gap-3">
        <Skeleton className="size-11" radius="xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
      </header>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <SkeletonPanel className="h-28" />
          <SkeletonPanel className="h-28" />
        </div>
        <SkeletonPanel className="h-20" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-24" />
          {[0, 1, 2].map((index) => (
            <Panel key={index} className="space-y-2 py-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-full max-w-sm" />
            </Panel>
          ))}
        </div>
      </div>
    </PageShell>
  )
}