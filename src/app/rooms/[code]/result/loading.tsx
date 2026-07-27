import { Skeleton, SkeletonPanel } from '@/components/ui'
import { getDict } from '@/lib/i18n/server'

/** 결과 화면 모양의 스켈레톤 — 헤더 + 순위 목록 + 뱃지 2칸을 흉내낸다. */
export default async function Loading() {
  const { d } = await getDict()
  return (
    <main
      id="main"
      className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-16 pt-8 lg:px-8"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">{d.loading.computingResult}</span>
      <header className="space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-10 w-40" />
      </header>

      <section className="space-y-2">
        <SkeletonPanel className="h-16" />
        <SkeletonPanel className="h-16" />
        <SkeletonPanel className="h-16" />
      </section>

      <section className="grid grid-cols-2 gap-2">
        <SkeletonPanel className="h-20" />
        <SkeletonPanel className="h-20" />
      </section>
    </main>
  )
}
