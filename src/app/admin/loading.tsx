import { Panel } from '@/components/ui'

function Bar({ className = '' }: { className?: string }) {
  return <div className={`rounded-md bg-white/10 motion-safe:animate-pulse ${className}`} />
}

/** 관리자 화면 모양의 스켈레톤 — 헤더 + 관리 섹션 블록을 흉내낸다. */
export default function Loading() {
  return (
    <main
      className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-16 pt-8"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">관리자 도구 여는 중…</span>
      <header className="flex items-center gap-3">
        <Bar className="h-6 w-6 rounded-full" />
        <Bar className="h-9 w-28" />
      </header>

      <Panel className="h-48 motion-safe:animate-pulse">{null}</Panel>
      <Panel className="h-32 motion-safe:animate-pulse">{null}</Panel>
    </main>
  )
}
