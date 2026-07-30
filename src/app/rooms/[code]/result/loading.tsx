import { FixedBody, FixedPage, Panel, Skeleton, SkeletonPanel } from '@/components/ui'
import { getDict } from '@/lib/i18n/server'

export default async function Loading() {
  const { d } = await getDict()

  return (
    <FixedPage width="wide">
      <div role="status" aria-live="polite">
        <span className="sr-only">{d.loading.computingResult}</span>
      </div>
      <header className="mb-3 shrink-0 space-y-1.5">
        <Skeleton className="h-4 w-56 max-w-full" />
        <Skeleton className="h-9 w-40" />
      </header>
      <FixedBody className="gap-3">
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <SkeletonPanel key={index} className="h-16" />
          ))}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <Panel className="flex min-h-0 flex-1 flex-col gap-2">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-16 shrink-0" radius="xl" />
            ))}
          </Panel>
          <Panel className="flex min-h-0 flex-1 flex-col gap-2">
            {[0, 1].map((index) => (
              <Skeleton key={index} className="h-16 shrink-0" radius="xl" />
            ))}
          </Panel>
          <Panel className="flex min-h-0 flex-1 flex-col gap-2">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-16 shrink-0" radius="xl" />
            ))}
          </Panel>
        </div>
      </FixedBody>
      <div className="shrink-0 space-y-2 pt-3">
        <Skeleton className="h-12" radius="xl" />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-12" radius="xl" />
          <Skeleton className="h-12" radius="xl" />
          <Skeleton className="col-span-2 h-12" radius="xl" />
        </div>
      </div>
    </FixedPage>
  )
}
