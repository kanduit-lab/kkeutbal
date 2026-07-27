'use client'

import { clsx } from 'clsx'
import type { ReactNode } from 'react'

export function Panel({
  className,
  children,
  as: Tag = 'section',
}: {
  className?: string
  /** 스켈레톤처럼 내용 없는 블록으로도 쓰인다 — 그때 {null} 을 넘기게 하지 않는다. */
  children?: ReactNode
  as?: 'section' | 'div' | 'article'
}) {
  return <Tag className={clsx('lacquer rounded-2xl p-5', className)}>{children}</Tag>
}

/**
 * 로딩 자리 표시자. 같은 2줄짜리 구현이 loading.tsx 6개에 복붙돼 있었고
 * 그중 하나는 motion-safe 가드를 잃어 reduced-motion 을 무시하고 있었다.
 */
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

/** 패널 모양의 로딩 블록. */
export function SkeletonPanel({ className }: { className?: string }) {
  return <Panel as="div" className={clsx('motion-safe:animate-pulse', className)} />
}

/**
 * 숫자 한 개를 라벨과 함께 보여주는 타일. inset(패널 안 오목한 칩)과
 * panel(단독 옻칠 패널) 두 톤이 같은 개념으로 따로 구현돼 있던 걸 합쳤다.
 */
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
        tone === 'inset' && 'rounded-xl bg-bg-deep/60 py-2.5',
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
  // 로컬 accumulator — 함수 밖으로 새지 않음
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!
}

/** 사람 아이콘 — 프로필 이미지가 없으면 이름 첫 글자 + 이름 기반 고정 색. */
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
      style={{ width: size, height: size, backgroundColor: avatarColor(name), fontSize: size * 0.42 }}
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

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gold/20 p-8 text-center">
      <p className="font-medium text-muted">{title}</p>
      {hint ? <p className="mt-1.5 text-sm text-muted/70">{hint}</p> : null}
    </div>
  )
}
