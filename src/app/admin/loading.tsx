import { FixedPage, Skeleton } from '@/components/ui'
import { SectionSkeleton } from '@/features/auth/components/admin-dashboard'
import { getDict } from '@/lib/i18n/server'

export default async function Loading() {
  const { d } = await getDict()
  return (
    <FixedPage width="wide">
      <header className="mb-3 flex shrink-0 items-start gap-3">
        <Skeleton className="size-11" radius="xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-5">
        <div className="grid shrink-0 grid-cols-4 gap-1.5 lg:grid-cols-1 lg:gap-2 lg:self-start">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-14 lg:h-16" radius="xl" />
          ))}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <Skeleton className="h-6 w-28 shrink-0" />
          <SectionSkeleton label={d.loading.admin} />
        </div>
      </div>
    </FixedPage>
  )
}
