'use client'

import { clsx } from 'clsx'
import type { Route } from 'next'
import type { ReactNode } from 'react'
import { Button, ButtonLink } from './button'

/**
 * 배타 선택 토글. 호출부마다 `variant={x === y ? 'primary' : 'surface'}` +
 * `className={x === y ? '' : 'border border-white/10'}` 를 손으로 쓰던 패턴을 대체한다.
 * radiogroup 시맨틱을 줘서 스크린리더가 "N 중 하나 선택"으로 읽는다.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  size = 'md',
  className,
  disabled = false,
}: {
  value: T
  onChange: (next: T) => void
  options: readonly { value: T; label: ReactNode; disabledReason?: string }[]
  ariaLabel: string
  size?: 'sm' | 'md'
  className?: string
  disabled?: boolean
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={clsx('grid gap-2', className)}>
      {options.map((option) => (
        <Button
          key={option.value}
          role="radio"
          aria-checked={option.value === value}
          // role=radio 는 aria-checked 로 상태를 말한다 — selected 가 붙이는 aria-pressed 와
          // 섞이면 안 되므로 여기서는 variant 를 직접 고른다.
          variant={option.value === value ? 'primary' : 'outline'}
          size={size}
          disabled={disabled || Boolean(option.disabledReason)}
          disabledReason={option.disabledReason}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  )
}

/** 링크로 된 탭 줄 — 현재 항목에 aria-current="page" 가 붙는다. */
export function SegmentedLinks({
  items,
  ariaLabel,
  size = 'md',
  className,
}: {
  items: readonly { href: Route; label: ReactNode; active: boolean }[]
  ariaLabel: string
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <nav aria-label={ariaLabel} className={clsx('flex flex-wrap gap-2', className)}>
      {items.map((item) => (
        <ButtonLink key={item.href} href={item.href} selected={item.active} size={size}>
          {item.label}
        </ButtonLink>
      ))}
    </nav>
  )
}
