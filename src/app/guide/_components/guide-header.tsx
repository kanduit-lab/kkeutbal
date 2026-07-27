import Link from 'next/link'
import type { Route } from 'next'

/**
 * 가이드 하위 페이지 공통 헤더 — 뒤로가기 + 제목 + 한 줄 설명.
 * 뒤로가기는 44px 터치 타깃을 확보한다 (예전 size-9 = 36px).
 */
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
    <header className="rise-in mb-8 flex items-start gap-2 lg:mb-10">
      <Link
        href={backHref}
        aria-label={backLabel}
        className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-xl text-muted transition-colors hover:text-text"
      >
        ←
      </Link>
      <div className="min-w-0">
        <h1 className="font-brush text-3xl font-black tracking-tight lg:text-4xl">
          {emoji ? (
            <span aria-hidden className="mr-2">
              {emoji}
            </span>
          ) : null}
          {title}
        </h1>
        {description ? <p className="mt-2 max-w-2xl text-muted">{description}</p> : null}
      </div>
    </header>
  )
}
