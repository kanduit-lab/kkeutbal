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