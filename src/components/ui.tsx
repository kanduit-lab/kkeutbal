'use client'

import { clsx } from 'clsx'
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * 공용 UI 프리미티브. 판 옆에서 한 손으로 쓰는 앱이라 터치 타깃은 48px 이상,
 * 상태(로딩/빈/에러)는 반드시 구분해 렌더한다.
 */

type ButtonVariant = 'primary' | 'surface' | 'danger' | 'ghost' | 'win'

export function Button({
  variant = 'surface',
  size = 'md',
  className,
  disabled,
  disabledReason,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: 'md' | 'lg' | 'sm'
  /** 비활성 사유 — 권한/상태 게이팅 시 이유를 보여준다 (ui-permission-gating). */
  disabledReason?: string
}) {
  return (
    <button
      {...props}
      disabled={disabled}
      title={disabled && disabledReason ? disabledReason : props.title}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-40',
        size === 'lg' && 'min-h-14 px-5 text-lg',
        size === 'md' && 'min-h-12 px-4 text-base',
        size === 'sm' && 'min-h-9 px-3 text-sm',
        variant === 'primary' &&
          'bg-accent text-white shadow-[0_2px_0_rgb(0_0_0/0.35)] hover:brightness-110 active:translate-y-px active:shadow-none',
        variant === 'win' &&
          'bg-win text-white shadow-[0_2px_0_rgb(0_0_0/0.35)] hover:brightness-110 active:translate-y-px active:shadow-none',
        variant === 'danger' && 'bg-[#471a17] text-[#ff9a94] hover:brightness-125',
        variant === 'surface' &&
          'bg-surface-raised text-text border border-gold/15 hover:border-gold/40',
        variant === 'ghost' && 'bg-transparent text-muted hover:text-text',
        className,
      )}
    />
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
        'inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-colors',
        size === 'lg' && 'min-h-14 px-5 text-lg',
        size === 'md' && 'min-h-12 px-4 text-base',
        size === 'sm' && 'min-h-9 px-3 text-sm',
        variant === 'primary' &&
          'bg-accent text-white shadow-[0_2px_0_rgb(0_0_0/0.35)] hover:brightness-110 active:translate-y-px active:shadow-none',
        variant === 'win' &&
          'bg-win text-white shadow-[0_2px_0_rgb(0_0_0/0.35)] hover:brightness-110 active:translate-y-px active:shadow-none',
        variant === 'danger' && 'bg-[#471a17] text-[#ff9a94] hover:brightness-125',
        variant === 'surface' &&
          'bg-surface-raised text-text border border-gold/15 hover:border-gold/40',
        variant === 'ghost' && 'bg-transparent text-muted hover:text-text',
        className,
      )}
    />
  )
}

/** 확인 다이얼로그 — window.confirm 대체. 바깥 클릭·취소로 닫힌다. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  tone = 'primary',
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  body?: string
  confirmLabel: string
  tone?: 'primary' | 'danger'
  onConfirm: () => void
  onClose: () => void
}) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="lacquer w-full max-w-sm rounded-2xl p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="font-bold">{title}</p>
        {body ? <p className="mt-1.5 text-sm text-muted">{body}</p> : null}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function Panel({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return <section className={clsx('lacquer rounded-2xl p-5', className)}>{children}</section>
}

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

/**
 * 터치 전용 숫자 입력 — 키보드 없이 −/+ 만으로 조작한다.
 * 판 옆에서 한 손으로 쓰는 앱이라 number input 대신 이것을 기본으로 쓴다.
 */
export function Stepper({
  value,
  onChange,
  min = 1,
  max = 1_000_000,
  step = 1,
  ariaLabel,
  className,
}: {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  step?: number
  ariaLabel: string
  className?: string
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next))
  const buttonClass =
    'm-1 min-h-10 min-w-11 rounded-lg bg-white/[0.07] text-xl font-bold text-text/80 shadow-[0_1px_0_rgb(255_255_255/0.06)_inset] transition-all active:scale-95 active:bg-white/15 disabled:cursor-not-allowed disabled:opacity-25'
  return (
    <div
      className={clsx(
        'flex items-stretch overflow-hidden rounded-xl border border-gold/20 bg-bg-deep/70',
        className,
      )}
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className={buttonClass}
        disabled={value <= min}
        onClick={() => onChange(clamp(value - step))}
        aria-label="줄이기"
      >
        −
      </button>
      <div className="gilt flex min-w-16 flex-1 items-center justify-center px-2 text-xl font-black tabular-nums">
        {value.toLocaleString()}
      </div>
      <button
        type="button"
        className={buttonClass}
        disabled={value >= max}
        onClick={() => onChange(clamp(value + step))}
        aria-label="늘리기"
      >
        +
      </button>
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

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-muted">{label}</span>
      {children}
    </label>
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
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-bold',
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
      <span className="size-4 animate-spin rounded-full border-2 border-muted/40 border-t-text" />
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

/* ── Toast ───────────────────────────────────────────────── */

interface Toast {
  id: number
  message: string
  tone: 'info' | 'error' | 'success'
}

const ToastContext = createContext<{
  toast: (message: string, tone?: Toast['tone']) => void
} | null>(null)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within ToastProvider')
  return context
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly Toast[]>([])
  const nextId = useRef(1)

  const toast = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = nextId.current
    nextId.current += 1
    setToasts((current) => [...current.slice(-2), { id, message, tone }])
    setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
    }, 3500)
  }, [])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((item) => (
          <div
            key={item.id}
            className={clsx(
              'w-full max-w-sm rounded-xl px-4 py-3 text-sm font-medium shadow-lg',
              item.tone === 'info' && 'bg-surface-raised text-text border border-gold/20',
              item.tone === 'error' && 'bg-[#471a17] text-[#ff9a94] border border-accent/30',
              item.tone === 'success' && 'bg-[#123c26] text-[#7ad9a2] border border-win/30',
            )}
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
