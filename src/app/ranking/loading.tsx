import { Panel } from '@/components/ui'

function Bar({ className = '' }: { className?: string }) {
  return <div className={`rounded-md bg-white/10 motion-safe:animate-pulse ${className}`} />
}

/** 랭킹 화면 모양의 스켈레톤 — 헤더 + 필터 칩 2줄 + 순위 목록을 흉내낸다. */
export default function Loading() {
  return (
    <main
      className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-16 pt-8 lg:px-8"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">랭킹 불러오는 중…</span>
      <header className="flex items-center gap-3">
        <Bar className="h-6 w-6 rounded-full" />
        <Bar className="h-10 w-32" />
      </header>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Bar className="h-11 w-16 rounded-xl" />
          <Bar className="h-11 w-16 rounded-xl" />
          <Bar className="h-11 w-16 rounded-xl" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Bar className="h-11 w-20 rounded-xl" />
          <Bar className="h-11 w-20 rounded-xl" />
        </div>
      </div>

      <section className="space-y-2">
        <Panel className="h-14 motion-safe:animate-pulse">{null}</Panel>
        <Panel className="h-14 motion-safe:animate-pulse">{null}</Panel>
        <Panel className="h-14 motion-safe:animate-pulse">{null}</Panel>
        <Panel className="h-14 motion-safe:animate-pulse">{null}</Panel>
      </section>
    </main>
  )
}
