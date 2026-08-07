'use client'

import { clsx } from 'clsx'
import type { ReactNode } from 'react'

export function Panel({
  className,
  children,
  as: Tag = 'section',
  style,
}: {
  className?: string

  children?: ReactNode
  as?: 'section' | 'div' | 'article'
  /** 계산으로만 나오는 값(줄 높이에서 뽑은 `minHeight` 등)에만 쓴다. 나머지는 className으로 */
  style?: React.CSSProperties
}) {
  return (
    <Tag className={clsx('lacquer rounded-2xl p-5', className)} style={style}>
      {children}
    </Tag>
  )
}

export function PanelHeader({
  title,
  description,
  badge,
  actions,
}: {
  title: ReactNode
  description?: ReactNode
  badge?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="space-y-1">
      {/*
        배지만 있으면 위를 맞춘다 — 제목이 두 줄로 접혀도 배지가 첫 줄 옆에 남는다.
        버튼(44px)이 오면 얘기가 달라서, 위를 맞추면 26px 제목과 중심선이 11px 어긋난다.
      */}
      <div className={clsx('flex justify-between gap-3', actions ? 'items-center' : 'items-start')}>
        <h2 className="text-lg font-bold leading-snug">{title}</h2>
        {badge || actions ? (
          <span className={clsx('flex shrink-0 items-center gap-2', !actions && 'mt-0.5')}>
            {badge}
            {actions}
          </span>
        ) : null}
      </div>
      {description ? <p className="text-sm text-muted">{description}</p> : null}
    </div>
  )
}

export function Skeleton({
  className,
  radius = 'md',
}: {
  className?: string
  radius?: 'md' | 'xl' | 'full' | 'none'
}) {
  return (
    <div
      aria-hidden
      className={clsx(
        'bg-white/10 motion-safe:animate-pulse',
        radius === 'md' && 'rounded-md',
        radius === 'xl' && 'rounded-xl',
        radius === 'full' && 'rounded-full',
        className,
      )}
    />
  )
}

export function SkeletonPanel({ className }: { className?: string }) {
  return <Panel as="div" className={clsx('motion-safe:animate-pulse', className)} />
}

export function StatTile({
  label,
  children,
  tone = 'inset',
  valueClass,
}: {
  label: string
  children: ReactNode
  tone?: 'inset' | 'panel'
  valueClass?: string
}) {
  return (
    <div
      className={clsx(
        'px-2 text-center',
        tone === 'inset' && 'rounded-xl bg-inset py-2.5',
        tone === 'panel' && 'lacquer rounded-2xl py-4',
      )}
    >
      <p className="text-micro font-medium text-muted">{label}</p>
      <p className={clsx('font-black leading-tight tabular-nums', valueClass ?? 'text-lg')}>
        {children}
      </p>
    </div>
  )
}

const AVATAR_COLORS = [
  '#b45309',
  '#0e7490',
  '#7c3aed',
  '#be185d',
  '#15803d',
  '#b91c1c',
  '#4d7c0f',
  '#0369a1',
] as const

function avatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!
}

export function Avatar({
  name,
  url,
  size = 44,
  className,
}: {
  name: string
  url?: string | null
  size?: number
  className?: string
}) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 외부 IdP 아바타라 도메인을 고정할 수 없다
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className={clsx('shrink-0 rounded-full border-2 border-black/40 object-cover', className)}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full border-2 border-black/40 font-black text-white',
        className,
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: avatarColor(name),
        fontSize: size * 0.42,
      }}
      aria-hidden
    >
      {Array.from(name)[0]?.toUpperCase() ?? '?'}
    </span>
  )
}

export function Badge({
  tone = 'muted',
  children,
}: {
  tone?: 'muted' | 'accent' | 'win' | 'warn'
  children: ReactNode
}) {
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-bold',
        tone === 'muted' && 'bg-white/10 text-muted',
        tone === 'accent' && 'bg-accent/20 text-accent',
        tone === 'win' && 'bg-win/20 text-win',
        tone === 'warn' && 'bg-warn/20 text-warn',
      )}
    >
      {children}
    </span>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-muted" role="status">
      <span className="size-4 motion-safe:animate-spin rounded-full border-2 border-muted/40 border-t-text" />
      {label ? <span className="text-sm">{label}</span> : null}
    </span>
  )
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-dashed border-gold/20 p-8 text-center">
      <p className="font-medium text-muted">{title}</p>
      {hint ? <p className="mt-1.5 text-sm text-muted/70">{hint}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}