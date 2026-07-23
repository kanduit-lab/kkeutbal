import { Panel } from '@/components/ui'

function Bar({ className = '' }: { className?: string }) {
  return <div className={`rounded-md bg-white/10 motion-safe:animate-pulse ${className}`} />
}

/** 선수 전적 화면 모양의 스켈레톤 — 헤더(아바타·이름) + 요약 3칸 + 게임별 전적을 흉내낸다. */
export default function Loading() {
  return (
    <main
      className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-16 pt-8 lg:px-8"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">전적 불러오는 중…</span>
      <header className="flex items-center gap-3">
        <Bar className="h-12 w-12 shrink-0 rounded-full" />
        <Bar className="h-12 w-12 shrink-0 rounded-full" />
        <Bar className="h-9 w-40" />
      </header>

      <section className="grid grid-cols-3 gap-2">
        <Panel className="h-20 motion-safe:animate-pulse">{null}</Panel>
        <Panel className="h-20 motion-safe:animate-pulse">{null}</Panel>
        <Panel className="h-20 motion-safe:animate-pulse">{null}</Panel>
      </section>

      <section className="space-y-2">
        <Panel className="h-28 motion-safe:animate-pulse">{null}</Panel>
        <Panel className="h-28 motion-safe:animate-pulse">{null}</Panel>
      </section>
    </main>
  )
}
