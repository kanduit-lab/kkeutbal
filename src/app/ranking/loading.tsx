import { PageShell, Skeleton, SkeletonPanel } from '@/components/ui'
import { getDict } from '@/lib/i18n/server'

/** 랭킹 화면 모양의 스켈레톤 — 헤더 + 필터 칩(게임 4 · 기간 3) + 순위 목록을 흉내낸다. */
export default async function Loading() {
  const { d } = await getDict()

  return (
    <PageShell width="content">
      <div role="status" aria-live="polite" className="space-y-6">
        <span className="sr-only">{d.loading.ranking}</span>

        <header className="flex items-start gap-3">
          <Skeleton className="size-11 shrink-0" radius="xl" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
        </header>

        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-11 w-16" radius="xl" />
            <Skeleton className="h-11 w-16" radius="xl" />
            <Skeleton className="h-11 w-20" radius="xl" />
            <Skeleton className="h-11 w-16" radius="xl" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-11 w-24" radius="xl" />
            <Skeleton className="h-11 w-24" radius="xl" />
            <Skeleton className="h-11 w-24" radius="xl" />
          </div>
        </div>

        <div className="space-y-2">
          <SkeletonPanel className="h-14" />
          <SkeletonPanel className="h-14" />
          <SkeletonPanel className="h-14" />
          <SkeletonPanel className="h-14" />
        </div>
      </div>
    </PageShell>
  )
}
