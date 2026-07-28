'use client'

import { clsx } from 'clsx'
import Link from 'next/link'

import { useContext } from 'react'
import { useFormStatus } from 'react-dom'
import type { ReactNode } from 'react'
import { ToastContext } from './toast'

type ButtonVariant = 'primary' | 'surface' | 'outline' | 'danger' | 'ghost' | 'win'
type ButtonSize = 'sm' | 'md' | 'lg'

const BASE_CLASS =
  'inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition duration-100'

const SIZE_CLASS: Record<ButtonSize, string> = {
  lg: 'min-h-14 px-5 text-lg',
  md: 'min-h-12 px-4 text-base',
  sm: 'min-h-11 px-3 text-sm',
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-white shadow-[0_2px_0_rgb(0_0_0/0.35)] hover:brightness-110 active:translate-y-px active:shadow-none',
  win: 'bg-win text-white shadow-[0_2px_0_rgb(0_0_0/0.35)] hover:brightness-110 active:translate-y-px active:shadow-none',
  danger:
    'bg-danger-surface text-danger hover:brightness-125 active:translate-y-px active:brightness-90',
  surface:
    'bg-surface-raised text-text border border-gold/15 hover:border-gold/40 active:translate-y-px active:brightness-95',
  outline:
    'bg-surface-raised text-text border border-white/10 hover:border-white/25 active:translate-y-px active:brightness-95',
  ghost: 'bg-transparent text-muted hover:text-text active:translate-y-px active:brightness-90',
}

function ButtonSpinner() {
  return (
    <span
      aria-hidden
      className="size-4 shrink-0 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin"
    />
  )
}

export function Button({
  variant,
  size = 'md',
  className,
  disabled,
  disabledReason,
  pressed,
  selected,
  loading = false,
  loadingLabel,
  onClick,
  title,
  children,
  ...props
}: React.ComponentPropsWithRef<'button'> & {
  variant?: ButtonVariant
  size?: ButtonSize

  disabledReason?: string

  pressed?: boolean

  selected?: boolean

  loading?: boolean

  loadingLabel?: string
}) {
  const toastContext = useContext(ToastContext)
  const isDisabled = disabled || loading
  const blockedReason = isDisabled && disabledReason ? disabledReason : null
  const showReasonAsToast = Boolean(blockedReason && toastContext && !loading)
  const resolvedVariant: ButtonVariant =
    variant ?? (selected === undefined ? 'surface' : selected ? 'primary' : 'outline')
  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    if (blockedReason && toastContext && !loading) {
      event.preventDefault()
      toastContext.toast(blockedReason, 'info')
      return
    }
    onClick?.(event)
  }
  return (
    <button
      {...props}
      onClick={handleClick}
      disabled={showReasonAsToast ? false : isDisabled}
      aria-disabled={showReasonAsToast ? true : undefined}
      aria-busy={loading || undefined}
      aria-pressed={pressed ?? selected}
      title={!showReasonAsToast && blockedReason ? blockedReason : title}
      className={clsx(
        BASE_CLASS,
        'disabled:cursor-not-allowed disabled:opacity-40',
        showReasonAsToast && 'cursor-not-allowed opacity-60 ring-1 ring-inset ring-white/10',
        SIZE_CLASS[size],
        VARIANT_CLASS[resolvedVariant],
        className,
      )}
    >
      {loading ? <ButtonSpinner /> : null}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  )
}

export function SubmitButton({
  children,
  pendingLabel,
  variant = 'primary',
  size,
  className,
}: {
  children: ReactNode

  pendingLabel?: string
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
}) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      className={className}
      loading={pending}
      loadingLabel={pendingLabel}
    >
      {children}
    </Button>
  )
}

export function ButtonLink<T extends string>({
  variant,
  size = 'md',
  selected,
  className,
  ...props
}: React.ComponentProps<typeof Link<T>> & {
  variant?: ButtonVariant
  size?: ButtonSize

  selected?: boolean
}) {
  const resolvedVariant: ButtonVariant =
    variant ?? (selected === undefined ? 'surface' : selected ? 'primary' : 'outline')
  return (
    <Link
      {...props}
      aria-current={selected ? 'page' : undefined}
      className={clsx(BASE_CLASS, SIZE_CLASS[size], VARIANT_CLASS[resolvedVariant], className)}
    />
  )
}