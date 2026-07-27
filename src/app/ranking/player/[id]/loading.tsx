import { PageShell, Skeleton, SkeletonPanel } from '@/components/ui'
import { getDict } from '@/lib/i18n/server'

/** 선수 전적 화면 모양의 스켈레톤 — 헤더(뒤로·아바타·이름) + 요약 3칸 + 게임별 전적을 흉내낸다. */
export default async function Loading() {
  const { d } = await getDict()

  return (
    <PageShell width="content">
      <div role="status" aria-live="polite" className="space-y-6">
        <span className="sr-only">{d.loading.playerStats}</span>

        <header className="flex items-center gap-2">
          <Skeleton className="size-11 shrink-0" radius="xl" />
          <Skeleton className="size-11 shrink-0" radius="full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-44" />
          </div>
        </header>

        <div className="grid grid-cols-3 gap-2">
          <SkeletonPanel className="h-20" />
          <SkeletonPanel className="h-20" />
          <SkeletonPanel className="h-20" />
        </div>

        <div className="space-y-2">
          <SkeletonPanel className="h-28" />
          <SkeletonPanel className="h-28" />
        </div>
      </div>
    </PageShell>
  )
}
