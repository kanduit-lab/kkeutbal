'use client'

import { clsx } from 'clsx'
import { useContext } from 'react'
import { useFormStatus } from 'react-dom'
import type { ReactNode } from 'react'
import { ToastContext } from './toast'

/**
 * 공용 버튼 계열. 판 옆에서 한 손으로 쓰는 앱이라 터치 타깃은 48px 이상을 기본으로 한다.
 */

type ButtonVariant = 'primary' | 'surface' | 'danger' | 'ghost' | 'win'

export function Button({
  variant = 'surface',
  size = 'md',
  className,
  disabled,
  disabledReason,
  pressed,
  onClick,
  title,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: 'md' | 'lg' | 'sm'
  /** 비활성 사유 — 권한/상태 게이팅 시 이유를 보여준다 (ui-permission-gating). */
  disabledReason?: string
  /** 토글 버튼일 때만 지정 — aria-pressed 로만 노출되고 시각 변화는 없다. */
  pressed?: boolean
}) {
  // 터치 기기에는 title 툴팁이 없다. ToastProvider 안에서는 사유 있는 비활성 버튼을
  // 탭 가능한 aria-disabled 로 두고, 탭하면 사유를 토스트로 보여준다.
  // Provider 밖(테스트 등)에서는 기존 title 툴팁 + 실제 disabled 로 폴백한다.
  const toastContext = useContext(ToastContext)
  const blockedReason = disabled && disabledReason ? disabledReason : null
  const showReasonAsToast = Boolean(blockedReason && toastContext)
  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    if (blockedReason && toastContext) {
      // 폼 안의 submit 버튼이어도 제출되지 않게 막고 사유만 알려준다.
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
      disabled={showReasonAsToast ? false : disabled}
      aria-disabled={showReasonAsToast ? true : undefined}
      aria-pressed={pressed}
      title={!showReasonAsToast && blockedReason ? blockedReason : title}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition duration-100',
        'disabled:cursor-not-allowed disabled:opacity-40',
        // aria-disabled 는 실제 disabled 가 아니라 탭 가능하므로 흐림 처리를 직접 준다.
        showReasonAsToast && 'cursor-not-allowed opacity-40',
        size === 'lg' && 'min-h-14 px-5 text-lg',
        size === 'md' && 'min-h-12 px-4 text-base',
        size === 'sm' && 'min-h-9 px-3 text-sm',
        variant === 'primary' &&
          'bg-accent text-white shadow-[0_2px_0_rgb(0_0_0/0.35)] hover:brightness-110 active:translate-y-px active:shadow-none',
        variant === 'win' &&
          'bg-win text-white shadow-[0_2px_0_rgb(0_0_0/0.35)] hover:brightness-110 active:translate-y-px active:shadow-none',
        // 터치 기기엔 hover 가 없다 — 모든 변형이 눌린 순간의 피드백을 갖게 한다.
        variant === 'danger' &&
          'bg-[#471a17] text-[#ff9a94] hover:brightness-125 active:translate-y-px active:brightness-90',
        variant === 'surface' &&
          'bg-surface-raised text-text border border-gold/15 hover:border-gold/40 active:translate-y-px active:brightness-95',
        variant === 'ghost' &&
          'bg-transparent text-muted hover:text-text active:translate-y-px active:brightness-90',
        className,
      )}
    />
  )
}

/**
 * 폼 제출 버튼 — useFormStatus 로 상위 <form> 의 pending 을 읽어
 * 제출 중 이중 탭을 막고 진행 상태를 보여준다. <form> 내부에서만 동작한다.
 */
export function SubmitButton({
  children,
  pendingLabel = '처리 중…',
  variant = 'primary',
  size,
  className,
}: {
  children: ReactNode
  pendingLabel?: string
  variant?: ButtonVariant
  size?: 'md' | 'lg' | 'sm'
  className?: string
}) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant={variant} size={size} className={className} disabled={pending}>
      {pending ? pendingLabel : children}
    </Button>
  )
}

/** 버튼 룩의 내비게이션 링크 — Link 안에 button 을 중첩하면 클릭이 유실된다. */
export function ButtonLink({
  variant = 'surface',
  size = 'md',
  className,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: ButtonVariant
  size?: 'md' | 'lg' | 'sm'
  href: string
}) {
  return (
    <a
      {...props}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition duration-100',
        size === 'lg' && 'min-h-14 px-5 text-lg',
        size === 'md' && 'min-h-12 px-4 text-base',
        size === 'sm' && 'min-h-9 px-3 text-sm',
        variant === 'primary' &&
          'bg-accent text-white shadow-[0_2px_0_rgb(0_0_0/0.35)] hover:brightness-110 active:translate-y-px active:shadow-none',
        variant === 'win' &&
          'bg-win text-white shadow-[0_2px_0_rgb(0_0_0/0.35)] hover:brightness-110 active:translate-y-px active:shadow-none',
        // 터치 기기엔 hover 가 없다 — 모든 변형이 눌린 순간의 피드백을 갖게 한다.
        variant === 'danger' &&
          'bg-[#471a17] text-[#ff9a94] hover:brightness-125 active:translate-y-px active:brightness-90',
        variant === 'surface' &&
          'bg-surface-raised text-text border border-gold/15 hover:border-gold/40 active:translate-y-px active:brightness-95',
        variant === 'ghost' &&
          'bg-transparent text-muted hover:text-text active:translate-y-px active:brightness-90',
        className,
      )}
    />
  )
}
