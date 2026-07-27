import { PageShell, Panel, Skeleton, SkeletonPanel } from '@/components/ui'
import { getDict } from '@/lib/i18n/server'

/**
 * 지갑 스켈레톤. 자체 loading.tsx 가 없으면 루트의 홈 모양 스켈레톤이 폴백으로 떠서
 * "방 코드 입력창 + 바로가기" 골격이 먼저 보였다가 전혀 다른 레이아웃으로 갈린다.
 */
export default async function Loading() {
  const { d } = await getDict()
  return (
    <PageShell width="content">
      <div role="status" aria-live="polite">
        <span className="sr-only">{d.loading.wallet}</span>
      </div>
      <header className="mb-6 flex items-start gap-3">
        <Skeleton className="size-11" radius="xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
      </header>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <SkeletonPanel className="h-28" />
          <SkeletonPanel className="h-28" />
        </div>
        <SkeletonPanel className="h-20" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-24" />
          {[0, 1, 2].map((index) => (
            <Panel key={index} className="space-y-2 py-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-full max-w-sm" />
            </Panel>
          ))}
        </div>
      </div>
    </PageShell>
  )
}
