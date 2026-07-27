import { PageShell, Skeleton, SkeletonPanel } from '@/components/ui'
import { getDict } from '@/lib/i18n/server'

/**
 * 족보 판독 스켈레톤. 자체 loading.tsx 가 없으면 루트의 홈 모양 스켈레톤이 폴백으로 떠서
 * "방 코드 입력창 + 바로가기" 골격이 먼저 보였다가 전혀 다른 레이아웃으로 갈린다.
 */
export default async function Loading() {
  const { d } = await getDict()
  return (
    <PageShell width="wide" className="flex flex-col gap-6">
      <div role="status" aria-live="polite">
        <span className="sr-only">{d.loading.advisor}</span>
      </div>
      <header className="flex items-start gap-3">
        <Skeleton className="size-11" radius="xl" />
        <Skeleton className="h-8 w-36" />
      </header>
      <div className="grid max-w-xl grid-cols-3 gap-2">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-11" radius="xl" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="space-y-5 lg:order-2 lg:col-span-5">
          <SkeletonPanel className="min-h-36" />
          <Skeleton className="h-14 w-full" radius="xl" />
        </div>
        <div className="lg:order-1 lg:col-span-7">
          <SkeletonPanel className="min-h-96" />
        </div>
      </div>
    </PageShell>
  )
}
