import { clsx } from 'clsx'
import Link from 'next/link'
import type { ReactNode } from 'react'

const WIDTH_CLASS = {
  narrow: 'max-w-md',
  content: 'max-w-3xl',
  wide: 'max-w-6xl',
  board: 'max-w-7xl',
} as const

export function PageShell({
  width = 'wide',
  center = false,
  className,
  children,
}: {
  width?: keyof typeof WIDTH_CLASS

  center?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <main
      id="main"
      className={clsx(
        'mx-auto w-full px-4 pb-16 pt-6 sm:px-6',
        WIDTH_CLASS[width],
        center && 'flex flex-1 flex-col justify-center pb-6',
        className,
      )}
    >
      {children}
    </main>
  )
}

/**
 * 뷰포트에 남은 높이를 정확히 차지하는 페이지. 문서 스크롤이 생기지 않고,
 * 넘치는 내용은 안쪽 `ScrollPane`이나 `Pager`가 책임진다.
 * body가 `100dvh` flex 컬럼이라 프로모션 배너가 붙어도 높이가 어긋나지 않는다.
 */
export function FixedPage({
  width = 'wide',
  className,
  children,
}: {
  width?: keyof typeof WIDTH_CLASS
  className?: string
  children: ReactNode
}) {
  return (
    <main
      id="main"
      className={clsx(
        'mx-auto flex min-h-0 w-full flex-1 flex-col overflow-hidden px-4 pt-4 sm:px-6',
        'pb-[max(1rem,env(safe-area-inset-bottom))]',
        WIDTH_CLASS[width],
        className,
      )}
    >
      {children}
    </main>
  )
}

/** `FixedPage` 안에서 남은 높이를 전부 먹는 영역. 자식이 넘쳐도 페이지를 밀지 않는다. */
export function FixedBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('flex min-h-0 flex-1 flex-col', className)}>{children}</div>
}

/** 고정 페이지 안에서 스크롤을 허용하는 유일한 지점. 키보드 스크롤을 위해 포커스를 받는다. */
export function ScrollPane({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={clsx(
        'min-h-0 flex-1 overflow-y-auto overscroll-contain focus-visible:outline-none',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel,
  actions,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode

  backHref?: React.ComponentProps<typeof Link>['href']
  backLabel: string
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={clsx('mb-6', className)}>
      <div className="flex flex-nowrap items-center gap-x-3">
        {backHref ? (
          <Link
            href={backHref}
            aria-label={backLabel}
            className="-ml-2 inline-flex size-12 shrink-0 items-center justify-center rounded-xl text-xl text-muted transition hover:text-text"
          >
            ←
          </Link>
        ) : null}
        <h1 className="font-brush min-w-0 flex-1 truncate text-2xl font-black">{title}</h1>
        {actions ? (
          <div className="ms-auto flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {subtitle ? (
        <p className={clsx('mt-1 text-sm text-muted', backHref && 'ps-[2.5rem]')}>{subtitle}</p>
      ) : null}
    </header>
  )
}