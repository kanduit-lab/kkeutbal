import { Panel } from '@/components/ui'

function Bar({ className = '' }: { className?: string }) {
  return <div className={`rounded-md bg-white/10 motion-safe:animate-pulse ${className}`} />
}

/** 방 화면 모양의 스켈레톤 — 헤더(뒤로가기·아이콘들) + 테이블 자리 + 옆 패널을 흉내낸다. */
export default function Loading() {
  return (
    <main
      className="mx-auto w-full max-w-6xl px-4 pb-56 pt-5 lg:px-8 lg:pb-12 lg:pt-8"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">방에 들어가는 중…</span>
      <header className="mb-5 flex items-center justify-between lg:mb-8">
        <div className="flex min-w-0 items-center gap-3">
          <Bar className="h-12 w-12 shrink-0 rounded-lg" />
          <Bar className="h-7 w-40" />
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Bar className="h-12 w-12 rounded-lg" />
          <Bar className="h-12 w-12 rounded-lg" />
          <Bar className="h-12 w-12 rounded-lg" />
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-12 lg:gap-6">
        <div className="lg:col-span-7 xl:col-span-8">
          <Panel className="aspect-[4/3] w-full motion-safe:animate-pulse lg:aspect-[16/10]">
            {null}
          </Panel>
        </div>
        <div className="mt-4 space-y-3 lg:col-span-5 lg:mt-0 xl:col-span-4">
          <Panel className="h-40 motion-safe:animate-pulse">{null}</Panel>
        </div>
      </div>
    </main>
  )
}
