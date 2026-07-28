'use client'

import { clsx } from 'clsx'
import type { Route } from 'next'
import type { ReactNode } from 'react'
import { Button, ButtonLink } from './button'

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