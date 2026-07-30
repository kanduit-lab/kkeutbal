import { FixedBody, FixedPage, Skeleton, SkeletonPanel } from '@/components/ui'
import { getDict } from '@/lib/i18n/server'

/**
 * `/rooms/[code]`와 그 아래(모니터·설정·결과·공정성) 전환 중 뜨는 골격.
 *
 * 다른 loading.tsx는 전부 `FixedPage`를 쓰는데 여기만 직접 `main`을 만들어 높이 제약이 없었다.
 * 그래서 방으로 들어가는 동안 이 골격이 뷰포트를 넘겨 문서 스크롤을 만들었다(Pixel 7에서
 * 963px, 뷰포트 839px — 모니터 화면으로 이동하는 순간을 e2e가 잡았다). 골격도 규약을 따라야
 * 화면 전환 중에 스크롤이 튀지 않는다. 아래 고정 바 골격은 `fixed`라 문서 높이에 기여하지
 * 않으므로 `pb-56`(액션바 자리 확보)은 필요 없다.
 */
export default async function Loading() {
  const { d } = await getDict()
  return (
    <FixedPage width="wide">
      <div role="status" aria-live="polite">
        <span className="sr-only">{d.loading.enteringRoom}</span>
      </div>
      <header className="mb-5 flex shrink-0 items-center justify-between lg:mb-8">
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
      <FixedBody className="gap-4 lg:grid lg:grid-cols-12 lg:gap-6">
        <div className="flex min-h-0 flex-1 flex-col lg:col-span-7 xl:col-span-8">
          <SkeletonPanel className="min-h-0 flex-1" />
        </div>
        <div className="shrink-0 lg:col-span-5 xl:col-span-4">
          <SkeletonPanel className="h-40" />
        </div>
      </FixedBody>
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
    </FixedPage>
  )
}
