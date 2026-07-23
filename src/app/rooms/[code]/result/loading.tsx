import { Panel } from '@/components/ui'

function Bar({ className = '' }: { className?: string }) {
  return <div className={`rounded-md bg-white/10 motion-safe:animate-pulse ${className}`} />
}

/** 결과 화면 모양의 스켈레톤 — 헤더 + 순위 목록 + 뱃지 2칸을 흉내낸다. */
export default function Loading() {
  return (
    <main
      className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-16 pt-8 lg:px-8"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">결과 집계 중…</span>
      <header className="space-y-2">
        <Bar className="h-4 w-48" />
        <Bar className="h-10 w-40" />
      </header>

      <section className="space-y-2">
        <Panel className="h-16 motion-safe:animate-pulse">{null}</Panel>
        <Panel className="h-16 motion-safe:animate-pulse">{null}</Panel>
        <Panel className="h-16 motion-safe:animate-pulse">{null}</Panel>
      </section>

      <section className="grid grid-cols-2 gap-2">
        <Panel className="h-20 motion-safe:animate-pulse">{null}</Panel>
        <Panel className="h-20 motion-safe:animate-pulse">{null}</Panel>
      </section>
    </main>
  )
}
