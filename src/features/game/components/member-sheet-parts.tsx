'use client'

import { clsx } from 'clsx'
import type { ReactNode } from 'react'

/** 시트 내부 섹션 — 아이콘·제목·힌트가 있는 카드. */
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

export function StatTile({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="rounded-xl bg-bg-deep/60 px-2 py-2.5 text-center">
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <p className={clsx('mt-0.5 text-lg font-black tabular-nums leading-tight', valueClass)}>
        {value}
      </p>
    </div>
  )
}
