import { Panel } from '@/components/ui'

function Bar({ className = '' }: { className?: string }) {
  return <div className={`rounded-md bg-white/10 motion-safe:animate-pulse ${className}`} />
}

/** 홈 화면 모양의 스켈레톤 — 헤더·참가 패널·바로가기 3칸·활성 방 목록을 흉내낸다. */
export default function Loading() {
  return (
    <main
      className="mx-auto w-full max-w-6xl px-5 pb-16 pt-8 lg:px-8 lg:pt-12"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">불러오는 중…</span>
      <header className="mb-8 flex items-end justify-between lg:mb-12">
        <Bar className="h-12 w-40 lg:h-14 lg:w-56" />
        <div className="flex items-center gap-2">
          <Bar className="h-8 w-20 rounded-full" />
          <Bar className="h-8 w-16 rounded-full" />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-5">
          <Panel className="space-y-4">
            <Bar className="h-5 w-24" />
            <div className="flex gap-2">
              <Bar className="h-12 flex-1" />
              <Bar className="h-12 w-24 shrink-0" />
            </div>
            <Bar className="h-12 w-full" />
          </Panel>

          <div className="grid grid-cols-3 gap-3">
            <Panel className="h-24 motion-safe:animate-pulse">{null}</Panel>
            <Panel className="h-24 motion-safe:animate-pulse">{null}</Panel>
            <Panel className="h-24 motion-safe:animate-pulse">{null}</Panel>
          </div>
        </div>

        <div className="space-y-3 lg:col-span-7">
          <Bar className="h-5 w-28" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Panel className="h-20 motion-safe:animate-pulse">{null}</Panel>
            <Panel className="h-20 motion-safe:animate-pulse">{null}</Panel>
          </div>
        </div>
      </div>
    </main>
  )
}
