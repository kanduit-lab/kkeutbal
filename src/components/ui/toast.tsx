'use client'

import { clsx } from 'clsx'
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

interface ToastAction {
  label: string
  onClick: () => void
}

interface Toast {
  id: number
  message: string
  tone: 'info' | 'error' | 'success'
  action?: ToastAction
}

export interface ToastOptions {
  action?: ToastAction
  durationMs?: number
}

export const ToastContext = createContext<{
  toast: (message: string, tone?: Toast['tone'], options?: ToastOptions) => void
} | null>(null)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within ToastProvider')
  return context
}

function lifetimeFor(tone: Toast['tone'], hasAction: boolean): number {
  if (hasAction) return 8000
  return tone === 'error' ? 6000 : 3500
}

export function ToastProvider({
  children,
  closeLabel = '닫기',
}: {
  children: ReactNode

  closeLabel?: string
}) {
  const [toasts, setToasts] = useState<readonly Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, tone: Toast['tone'] = 'info', options?: ToastOptions) => {
      const id = nextId.current
      nextId.current += 1
      setToasts((current) => {
        if (current.some((item) => item.message === message && item.tone === tone)) return current
        return [...current.slice(-2), { id, message, tone, action: options?.action }]
      })
      setTimeout(
        () => {
          setToasts((current) => current.filter((item) => item.id !== id))
        },
        options?.durationMs ?? lifetimeFor(tone, Boolean(options?.action)),
      )
    },
    [],
  )

  const value = useMemo(() => ({ toast }), [toast])
  const errors = toasts.filter((item) => item.tone === 'error')
  const others = toasts.filter((item) => item.tone !== 'error')

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className="pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),0.75rem)] z-[60] flex flex-col items-center gap-2 px-4">
        <div role="alert" aria-live="assertive" className="contents">
          {errors.map((item) => (
            <ToastItem key={item.id} toast={item} onDismiss={dismiss} closeLabel={closeLabel} />
          ))}
        </div>
        <div role="status" aria-live="polite" className="contents">
          {others.map((item) => (
            <ToastItem key={item.id} toast={item} onDismiss={dismiss} closeLabel={closeLabel} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({
  toast,
  onDismiss,
  closeLabel,
}: {
  toast: Toast
  onDismiss: (id: number) => void
  closeLabel: string
}) {
  return (
    <div
      className={clsx(
        'toast-in pointer-events-auto flex w-full max-w-sm items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg',
        toast.tone === 'info' && 'border border-gold/20 bg-surface-raised text-text',
        toast.tone === 'error' && 'border border-accent/30 bg-danger-surface text-danger',
        toast.tone === 'success' && 'border border-win/30 bg-success-surface text-success-fg',
      )}
    >
      <span className="min-w-0 flex-1">{toast.message}</span>
      {toast.action ? (
        <button
          type="button"
          className="shrink-0 rounded-lg px-2 py-1 font-bold underline underline-offset-2"
          onClick={() => {
            toast.action?.onClick()
            onDismiss(toast.id)
          }}
        >
          {toast.action.label}
        </button>
      ) : null}
      <button
        type="button"
        aria-label={closeLabel}
        className="-mr-2 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-base opacity-70 transition hover:opacity-100"
        onClick={() => onDismiss(toast.id)}
      >
        ✕
      </button>
    </div>
  )
}