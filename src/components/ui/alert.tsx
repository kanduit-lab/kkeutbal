'use client'

import { clsx } from 'clsx'
import type { ReactNode } from 'react'

export function Alert({
  tone,
  title,
  children,
  className,
}: {
  tone: 'error' | 'warn' | 'success' | 'info'
  title?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={clsx(
        'rounded-xl border px-4 py-3 text-sm font-medium',
        tone === 'error' && 'border-accent/30 bg-danger-surface text-danger',
        tone === 'warn' && 'border-gold/30 bg-gold/10 text-warn',
        tone === 'success' && 'border-win/30 bg-success-surface text-success-fg',
        tone === 'info' && 'border-gold/20 bg-surface-raised text-text',
        className,
      )}
    >
      {title ? <p className="font-bold">{title}</p> : null}
      <div className={clsx(title && 'mt-1 font-normal opacity-90')}>{children}</div>
    </div>
  )
}