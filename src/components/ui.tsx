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
