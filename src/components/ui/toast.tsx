'use client'

import { clsx } from 'clsx'
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/* ── Toast ───────────────────────────────────────────────── */

interface Toast {
  id: number
  message: string
  tone: 'info' | 'error' | 'success'
}

/**
 * ui/button.tsx 의 Button 이 disabledReason 을 토스트로 보여주기 위해 이 컨텍스트를
 * 직접 구독한다 (Provider 밖에서는 null 이라 title 툴팁으로 폴백한다) — 그래서
 * export 로 열어 두고, 공개 배럴(index.ts)에는 올리지 않는다.
 */
export const ToastContext = createContext<{
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
    setToasts((current) => {
      // 같은 메시지가 이미 떠 있으면 중복으로 쌓지 않는다 (비활성 버튼 연타 등).
      if (current.some((item) => item.message === message && item.tone === tone)) return current
      return [...current.slice(-2), { id, message, tone }]
    })
    // 에러는 읽을 시간을 더 준다.
    const lifetime = tone === 'error' ? 6000 : 3500
    setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
    }, lifetime)
  }, [])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* 노치·다이나믹 아일랜드를 피해 safe-area 아래에서 시작한다 (viewport-fit=cover 전제). */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),0.75rem)] z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((item) => (
          <div
            key={item.id}
            role={item.tone === 'error' ? 'alert' : undefined}
            className={clsx(
              'toast-in w-full max-w-sm rounded-xl px-4 py-3 text-sm font-medium shadow-lg',
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
