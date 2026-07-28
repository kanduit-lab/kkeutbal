'use client'

import type { ReactNode } from 'react'

export function Section({
  icon,
  title,
  hint,
  children,
}: {
  icon: string
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <section className="space-y-2.5 rounded-2xl border border-white/5 bg-bg-deep/50 p-4">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <span aria-hidden>{icon}</span>
          {title}
        </p>
        {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  )
}