import { FixedBody, FixedPage, Panel, Skeleton, SkeletonPanel } from '@/components/ui'
import { getDict } from '@/lib/i18n/server'

export default async function Loading() {
  const { d } = await getDict()

  return (
    <FixedPage width="content">
      <div role="status" aria-live="polite">
        <span className="sr-only">{d.loading.playerStats}</span>
      </div>
      <header className="mb-4 flex shrink-0 items-center gap-2">
        <Skeleton className="size-11 shrink-0" radius="xl" />
        <Skeleton className="size-11 shrink-0" radius="full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-44" />
        </div>
      </header>
      <FixedBody className="gap-4">
        <div className="grid shrink-0 grid-cols-3 gap-2">
          <SkeletonPanel className="h-20" />
          <SkeletonPanel className="h-20" />
          <SkeletonPanel className="h-20" />
        </div>
        <div className="grid shrink-0 gap-2 lg:grid-cols-3">
          <SkeletonPanel className="h-28" />
          <SkeletonPanel className="h-28" />
        </div>
        <Panel className="flex min-h-0 flex-1 flex-col gap-2">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-16 shrink-0" radius="xl" />
          ))}
        </Panel>
      </FixedBody>
    </FixedPage>
  )
}
