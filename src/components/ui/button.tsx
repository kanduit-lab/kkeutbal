'use client'

import { clsx } from 'clsx'
import Link from 'next/link'

import { useContext } from 'react'
import { useFormStatus } from 'react-dom'
import type { ReactNode } from 'react'
import { ToastContext } from './toast'

/**
 * 공용 버튼 계열. 판 옆에서 한 손으로 쓰는 앱이라 터치 타깃은 44px 이상을 기본으로 한다.
 */

type ButtonVariant = 'primary' | 'surface' | 'outline' | 'danger' | 'ghost' | 'win'
type ButtonSize = 'sm' | 'md' | 'lg'

const BASE_CLASS =
  'inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition duration-100'

/** 크기별 최소 높이 — sm 도 44px 미만으로 내려가지 않는다 (모바일 탭 타깃 기준). */
const SIZE_CLASS: Record<ButtonSize, string> = {
  lg: 'min-h-14 px-5 text-lg',
  md: 'min-h-12 px-4 text-base',
  sm: 'min-h-11 px-3 text-sm',
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-white shadow-[0_2px_0_rgb(0_0_0/0.35)] hover:brightness-110 active:translate-y-px active:shadow-none',
  win: 'bg-win text-white shadow-[0_2px_0_rgb(0_0_0/0.35)] hover:brightness-110 active:translate-y-px active:shadow-none',
  // 터치 기기엔 hover 가 없다 — 모든 변형이 눌린 순간의 피드백을 갖게 한다.
  danger:
    'bg-danger-surface text-danger hover:brightness-125 active:translate-y-px active:brightness-90',
  /** 패널 위에 얹는 금테 버튼 */
  surface:
    'bg-surface-raised text-text border border-gold/15 hover:border-gold/40 active:translate-y-px active:brightness-95',
  /** 중립 보조 버튼 — 토글의 비선택 상태가 이걸 쓴다 */
  outline:
    'bg-surface-raised text-text border border-white/10 hover:border-white/25 active:translate-y-px active:brightness-95',
  ghost: 'bg-transparent text-muted hover:text-text active:translate-y-px active:brightness-90',
}

/** 버튼 안에 들어가는 작은 스피너 — primitives 의 Spinner 는 라벨·role 을 갖고 있어 별도로 둔다. */
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
  /** 비활성 사유 — 권한/상태 게이팅 시 이유를 보여준다 (ui-permission-gating). */
  disabledReason?: string
  /** 토글 버튼일 때만 지정 — aria-pressed 로만 노출되고 시각 변화는 없다. */
  pressed?: boolean
  /**
   * 선택형 토글의 시각 상태. 지정하면 variant 를 선택=primary / 비선택=outline 으로
   * 대신 고른다 — 호출부마다 삼항으로 쓰던 걸 한곳에 모은다. aria-pressed 도 함께 채운다.
   */
  selected?: boolean
  /**
   * 진행 중 표시. 스피너를 붙이고 aria-busy 를 세우며 disabled 를 함의한다.
   * Server Action 위에 올라간 앱이라 "눌렀는데 아무 일도 없어 보이는" 구간이 기본값이면 안 된다.
   */
  loading?: boolean
  /** 진행 중 라벨 교체 — 생략하면 children 을 그대로 둔다. */
  loadingLabel?: string
}) {
  // 터치 기기에는 title 툴팁이 없다. ToastProvider 안에서는 사유 있는 비활성 버튼을
  // 탭 가능한 aria-disabled 로 두고, 탭하면 사유를 토스트로 보여준다.
  // Provider 밖(테스트 등)에서는 기존 title 툴팁 + 실제 disabled 로 폴백한다.
  const toastContext = useContext(ToastContext)
  const isDisabled = disabled || loading
  const blockedReason = isDisabled && disabledReason ? disabledReason : null
  const showReasonAsToast = Boolean(blockedReason && toastContext && !loading)
  const resolvedVariant: ButtonVariant =
    variant ?? (selected === undefined ? 'surface' : selected ? 'primary' : 'outline')
  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    if (blockedReason && toastContext && !loading) {
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
      disabled={showReasonAsToast ? false : isDisabled}
      aria-disabled={showReasonAsToast ? true : undefined}
      aria-busy={loading || undefined}
      aria-pressed={pressed ?? selected}
      title={!showReasonAsToast && blockedReason ? blockedReason : title}
      className={clsx(
        BASE_CLASS,
        'disabled:cursor-not-allowed disabled:opacity-40',
        // aria-disabled 는 실제 disabled 가 아니라 탭 가능하다 — 흐림만으로 구분하면
        // 대비가 3:1 아래로 떨어져 정작 사유를 읽을 수 없다. 링을 함께 준다.
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

/**
 * 폼 제출 버튼 — useFormStatus 로 상위 <form> 의 pending 을 읽어
 * 제출 중 이중 탭을 막고 진행 상태를 보여준다. <form> 내부에서만 동작한다.
 */
export function SubmitButton({
  children,
  pendingLabel,
  variant = 'primary',
  size,
  className,
}: {
  children: ReactNode
  /** 진행 중 라벨. 로케일 문자열을 넘긴다 — 생략하면 라벨은 그대로 두고 스피너만 붙는다. */
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

/**
 * 버튼 룩의 내비게이션 링크 — Link 안에 button 을 중첩하면 클릭이 유실된다.
 * 생 <a> 를 쓰면 앱 내 이동이 전체 새로고침이 되므로 next/link 로 렌더한다.
 */
export function ButtonLink<T extends string>({
  variant,
  size = 'md',
  selected,
  className,
  ...props
}: React.ComponentProps<typeof Link<T>> & {
  variant?: ButtonVariant
  size?: ButtonSize
  /** 탭 링크의 현재 상태 — 선택=primary / 비선택=outline */
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
