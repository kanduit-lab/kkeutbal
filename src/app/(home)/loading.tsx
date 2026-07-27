import { PageShell, Skeleton, SkeletonPanel } from '@/components/ui'
import { getDict } from '@/lib/i18n/server'

/**
 * 홈 화면 모양의 스켈레톤 — 헤더·참가 패널·바로가기 3칸·활성 방 목록을 흉내낸다.
 * 라우트 그룹 안에 두어 홈에서만 쓰인다. 예전에는 app/loading.tsx 에 있어서
 * 자체 loading.tsx 가 없는 11개 라우트가 전부 "홈 모양"으로 깜빡였다.
 */
export default async function Loading() {
  const { d } = await getDict()

  return (
    <PageShell width="wide">
      <div role="status" aria-live="polite">
        <span className="sr-only">{d.loading.default}</span>

        <header className="mb-8 flex flex-wrap items-end justify-between gap-x-3 gap-y-2 lg:mb-12">
          <Skeleton className="h-12 w-40 lg:h-14 lg:w-56" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-11 w-20" radius="xl" />
            <Skeleton className="h-11 w-16" radius="xl" />
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-5">
            <SkeletonPanel className="h-56" />
            <div className="grid grid-cols-3 gap-3">
              <SkeletonPanel className="h-24" />
              <SkeletonPanel className="h-24" />
              <SkeletonPanel className="h-24" />
            </div>
          </div>

          <div className="space-y-3 lg:col-span-7">
            <Skeleton className="h-5 w-28" />
            <div className="grid gap-3 sm:grid-cols-2">
              <SkeletonPanel className="h-20" />
              <SkeletonPanel className="h-20" />
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
