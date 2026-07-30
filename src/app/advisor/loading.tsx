import { FixedPage, Skeleton, SkeletonPanel } from '@/components/ui'
import { getDict } from '@/lib/i18n/server'

export default async function Loading() {
  const { d } = await getDict()
  return (
    <FixedPage width="wide" className="gap-4">
      <div role="status" aria-live="polite">
        <span className="sr-only">{d.loading.advisor}</span>
      </div>
      <header className="flex shrink-0 items-start gap-3">
        <Skeleton className="size-11" radius="xl" />
        <Skeleton className="h-8 w-36" />
      </header>
      <div className="grid max-w-xl shrink-0 grid-cols-3 gap-2">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-11" radius="xl" />
        ))}
      </div>
      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[7fr_5fr]">
        <SkeletonPanel className="min-h-0" />
        <SkeletonPanel className="min-h-0" />
      </div>
    </FixedPage>
  )
}
