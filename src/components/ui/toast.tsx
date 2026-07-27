'use client'

import { clsx } from 'clsx'
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/* ── Toast ───────────────────────────────────────────────── */

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
  /** 즉시 유용한 후속 동작만 넣는다 — 되돌리기·다시 시도 (ui-states-and-feedback). */
  action?: ToastAction
  durationMs?: number
}

/**
 * ui/button.tsx 의 Button 이 disabledReason 을 토스트로 보여주기 위해 이 컨텍스트를
 * 직접 구독한다 (Provider 밖에서는 null 이라 title 툴팁으로 폴백한다) — 그래서
 * export 로 열어 두고, 공개 배럴(index.ts)에는 올리지 않는다.
 */
export const ToastContext = createContext<{
  toast: (message: string, tone?: Toast['tone'], options?: ToastOptions) => void
} | null>(null)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within ToastProvider')
  return context
}

/** 에러는 읽을 시간을 더 준다. 후속 동작이 달리면 누를 시간까지 준다. */
function lifetimeFor(tone: Toast['tone'], hasAction: boolean): number {
  if (hasAction) return 8000
  return tone === 'error' ? 6000 : 3500
}

export function ToastProvider({
  children,
  closeLabel = '닫기',
}: {
  children: ReactNode
  /** 닫기 버튼의 접근성 라벨. layout 이 로케일 문자열을 넘긴다. */
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
        // 같은 메시지가 이미 떠 있으면 중복으로 쌓지 않는다 (비활성 버튼 연타 등).
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
      {/* 노치·다이나믹 아일랜드를 피해 safe-area 아래에서 시작한다 (viewport-fit=cover 전제). */}
      <div className="pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),0.75rem)] z-[60] flex flex-col items-center gap-2 px-4">
        {/*
         * 라이브 리전을 톤별로 나눈다. 하나의 polite 컨테이너 안에 role="alert" 항목을
         * 중첩하면 스크린리더 동작이 정의되지 않는다 — 에러는 assertive 컨테이너로 분리.
         */}
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
