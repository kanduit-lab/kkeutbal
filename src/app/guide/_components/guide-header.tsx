import Link from 'next/link'
import type { Route } from 'next'

/** 가이드 하위 페이지 공통 헤더 — 뒤로가기 + 제목 + 한 줄 설명. */
export function GuideHeader({
  backHref,
  backLabel,
  emoji,
  title,
  description,
}: {
  backHref: Route
  backLabel: string
  emoji?: string
  title: string
  description?: string
}) {
  return (
    <header className="rise-in mb-8 flex items-start gap-3 lg:mb-10">
      <Link
        href={backHref}
        aria-label={backLabel}
        className="mt-1.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-xl text-muted transition-colors hover:text-text"
      >
        ←
      </Link>
      <div>
        <h1 className="font-brush text-3xl font-black tracking-tight lg:text-4xl">
          {emoji ? <span className="mr-2">{emoji}</span> : null}
          {title}
        </h1>
        {description ? <p className="mt-2 max-w-2xl text-muted">{description}</p> : null}
      </div>
    </header>
  )
}
