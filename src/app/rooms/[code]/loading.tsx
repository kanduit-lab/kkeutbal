import { Skeleton, SkeletonPanel } from '@/components/ui'
import { getDict } from '@/lib/i18n/server'

/**
 * 방 화면 모양의 스켈레톤 — 헤더(뒤로가기·아이콘들) + 테이블 자리 + 옆 패널을 흉내낸다.
 *
 * 비율은 GameTable 의 실제 값(aspect-[4/5] → sm 부터 16/10)과 반드시 같아야 한다.
 * 4/3 로 잡아 두던 시절에는 343px 폭 폰에서 257px 만 잡고 실제로는 429px 가 차지해
 * 테이블이 뜨는 순간 아래 내용이 170px 씩 아래로 튀었다.
 */
export default async function Loading() {
  const { d } = await getDict()
  return (
    <main
      id="main"
      className="mx-auto w-full max-w-6xl px-4 pb-56 pt-5 lg:px-8 lg:pb-12 lg:pt-8"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">{d.loading.enteringRoom}</span>
      <header className="mb-5 flex items-center justify-between lg:mb-8">
        <div className="flex min-w-0 items-center gap-3">
          <Skeleton className="h-12 w-12 shrink-0" radius="xl" />
          <Skeleton className="h-7 w-40" />
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Skeleton className="h-12 w-12" radius="xl" />
          <Skeleton className="h-12 w-12" radius="xl" />
          <Skeleton className="h-12 w-12" radius="xl" />
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-12 lg:gap-6">
        <div className="lg:col-span-7 xl:col-span-8">
          <SkeletonPanel className="aspect-[4/5] w-full sm:aspect-[16/10]" />
        </div>
        <div className="mt-4 space-y-3 lg:col-span-5 lg:mt-0 xl:col-span-4">
          <SkeletonPanel className="h-40" />
        </div>
      </div>

      {/* 하단 고정 ActionBar 자리 — 이 블록이 없으면 바가 붙는 순간 본문이 한 번 더 튄다. */}
      <div className="fixed inset-x-0 bottom-0 border-t border-gold/15 bg-bg-deep/95 lg:hidden">
        <div className="mx-auto w-full max-w-lg px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3">
          <Skeleton className="h-4 w-32" />
          <div className="mt-2.5 grid grid-cols-3 gap-2">
            <Skeleton className="h-14" radius="xl" />
            <Skeleton className="h-14" radius="xl" />
            <Skeleton className="h-14" radius="xl" />
          </div>
        </div>
      </div>
    </main>
  )
}
