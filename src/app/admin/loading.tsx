import { FixedPage, Skeleton } from '@/components/ui'
import { SectionSkeleton } from '@/features/auth/components/admin-dashboard'
import { getDict } from '@/lib/i18n/server'

export default async function Loading() {
  const { d } = await getDict()
  return (
    <FixedPage width="app">
      <header className="mb-3 flex shrink-0 items-start gap-3">
        <Skeleton className="size-11" radius="xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Skeleton className="h-14 shrink-0" radius="xl" />
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <Skeleton className="h-6 w-28 shrink-0" />
          <SectionSkeleton label={d.loading.admin} />
        </div>
      </div>
    </FixedPage>
  )
}
