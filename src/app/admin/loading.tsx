import { PageShell, Skeleton } from '@/components/ui'
import { SectionSkeleton } from '@/features/auth/components/admin-dashboard'
import { getDict } from '@/lib/i18n/server'

/**
 * 관리자 화면 스켈레톤 — 헤더 + 섹션 내비 + 섹션 자리.
 * 섹션 자리는 AdminDashboard 가 쓰는 SectionSkeleton 을 그대로 재사용한다 —
 * 라우트 스켈레톤과 섹션 스켈레톤의 모양이 다르면 진입 시 골격이 두 번 갈리며 깜빡인다.
 */
export default async function Loading() {
  const { d } = await getDict()
  return (
    <PageShell width="wide">
      <header className="mb-6 flex items-start gap-3">
        <Skeleton className="size-11" radius="xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
      </header>

      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-[5.5rem]" radius="xl" />
          ))}
        </div>
        <div className="space-y-3">
          <div className="space-y-2 px-1">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
          <SectionSkeleton label={d.loading.admin} />
        </div>
      </div>
    </PageShell>
  )
}
