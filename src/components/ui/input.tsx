'use client'

import { clsx } from 'clsx'
import type { ReactNode } from 'react'

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        'min-h-12 w-full rounded-xl border border-gold/15 bg-bg-deep/70 px-4 text-base text-text',
        'placeholder:text-muted/60 focus:border-gold/50 focus:outline-none',
        className,
      )}
    />
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-muted">{label}</span>
      {children}
    </label>
  )
}
