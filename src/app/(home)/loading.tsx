import { FixedBody, FixedPage, Skeleton, SkeletonPanel } from '@/components/ui'
import { getDict } from '@/lib/i18n/server'

export default async function Loading() {
  const { d } = await getDict()

  return (
    <FixedPage width="wide">
      <div role="status" aria-live="polite">
        <span className="sr-only">{d.loading.default}</span>
      </div>
      <header className="mb-3 flex shrink-0 flex-wrap items-end justify-between gap-x-3 gap-y-2 lg:mb-5">
        <Skeleton className="h-9 w-32 lg:h-12 lg:w-48" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-11 w-20" radius="xl" />
          <Skeleton className="h-11 w-16" radius="xl" />
        </div>
      </header>
      <FixedBody className="gap-3 lg:grid lg:grid-cols-12 lg:gap-6">
        <div className="shrink-0 space-y-3 lg:col-span-5 lg:space-y-6">
          <SkeletonPanel className="h-48" />
          <div className="grid grid-cols-3 gap-2 lg:gap-3">
            <SkeletonPanel className="h-20" />
            <SkeletonPanel className="h-20" />
            <SkeletonPanel className="h-20" />
          </div>
        </div>
        <div className="flex min-h-0 flex-col lg:col-span-7">
          <SkeletonPanel className="min-h-0 flex-1" />
        </div>
      </FixedBody>
    </FixedPage>
  )
}
