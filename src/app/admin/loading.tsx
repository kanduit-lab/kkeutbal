import { Panel } from '@/components/ui'

function Bar({ className = '' }: { className?: string }) {
  return <div className={`rounded-md bg-white/10 motion-safe:animate-pulse ${className}`} />
}

/** 관리자 화면 모양의 스켈레톤 — 헤더 + 관리 섹션 블록을 흉내낸다. */
export default function Loading() {
  return (
    <main
      className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-10"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">관리자 도구 여는 중…</span>
      <header className="flex items-center gap-3">
        <Bar className="size-10 rounded-xl" />
        <div className="space-y-2">
          <Bar className="h-9 w-40" />
          <Bar className="h-4 w-72 max-w-full" />
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Panel key={index} className="h-24 motion-safe:animate-pulse">
            {null}
          </Panel>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="h-64 motion-safe:animate-pulse">{null}</Panel>
        <Panel className="h-64 motion-safe:animate-pulse">{null}</Panel>
      </div>
    </main>
  )
}
