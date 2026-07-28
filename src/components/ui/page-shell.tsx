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
        center && 'flex min-h-dvh flex-col justify-center pb-6',
        className,
      )}
    >
      {children}
    </main>
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
    <header className={clsx('mb-6 flex flex-wrap items-start gap-x-3 gap-y-2', className)}>
      {backHref ? (
        <Link
          href={backHref}
          aria-label={backLabel}
          className="-ml-2 inline-flex size-12 shrink-0 items-center justify-center rounded-xl text-xl text-muted transition hover:text-text"
        >
          ←
        </Link>
      ) : null}
      <div className="min-w-0 flex-1 basis-48">
        <h1 className="font-brush truncate text-2xl font-black">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? (
        <div className="ms-auto flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </header>
  )
}