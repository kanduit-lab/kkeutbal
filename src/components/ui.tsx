'use client'

import { clsx } from 'clsx'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useFormStatus } from 'react-dom'
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
        'inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-colors',
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
        variant === 'danger' && 'bg-[#471a17] text-[#ff9a94] hover:brightness-125',
        variant === 'surface' &&
          'bg-surface-raised text-text border border-gold/15 hover:border-gold/40',
        variant === 'ghost' && 'bg-transparent text-muted hover:text-text',
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

/* ── Modal behavior ──────────────────────────────────────── */

/**
 * 모달 공통 동작 — 열리면 패널로 포커스 이동, body 스크롤 잠금, Escape 닫기,
 * 최소한의 Tab 포커스 트랩. 반환된 ref 를 패널 요소에 tabIndex={-1} 과 함께 단다.
 * 패널 내부가 스크롤되면 그 스크롤 요소에 `overscroll-contain` 을 줘서
 * 끝까지 스크롤했을 때 배경으로 스크롤이 새는 것(chaining)을 막을 것.
 */
export function useModalBehavior(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  // onClose 가 렌더마다 새 함수여도 포커스·스크롤 잠금 효과가 재실행되지 않게 ref 로 고정.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const previousActive =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      // 최소 포커스 트랩 — 패널 안 포커스 가능 요소 사이에서만 순환한다.
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      )
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeydown)
    return () => {
      document.removeEventListener('keydown', handleKeydown)
      document.body.style.overflow = previousOverflow
      previousActive?.focus()
    }
  }, [open])

  return panelRef
}

/** 확인 다이얼로그 — window.confirm 대체. 바깥 클릭·취소·Escape 로 닫힌다. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = '취소',
  tone = 'primary',
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  body?: string
  confirmLabel: string
  cancelLabel?: string
  tone?: 'primary' | 'danger'
  onConfirm: () => void
  onClose: () => void
}) {
  const panelRef = useModalBehavior(open, onClose)
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
        ref={panelRef}
        tabIndex={-1}
        className="lacquer w-full max-w-sm rounded-2xl p-5 focus:outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="font-bold">{title}</p>
        {body ? <p className="mt-1.5 text-sm text-muted">{body}</p> : null}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={onClose}>
            {cancelLabel}
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
 * 길게 누르면 자동 반복 — 400ms 홀드 후 120ms 간격으로 fire 를 호출한다.
 * fire 가 false 를 돌려주면(경계 도달) 스스로 멈춘다 — 경계에서 버튼이 disabled 로
 * 바뀌면 pointerup 이 그 버튼에 전달되지 않기 때문. 언마운트 시에도 타이머를 정리한다.
 */
function useHoldRepeat(fire: () => boolean) {
  const fireRef = useRef(fire)
  useEffect(() => {
    fireRef.current = fire
  }, [fire])

  const timersRef = useRef<{
    hold: ReturnType<typeof setTimeout> | null
    repeat: ReturnType<typeof setInterval> | null
  }>({ hold: null, repeat: null })

  const stop = useCallback(() => {
    const timers = timersRef.current
    if (timers.hold !== null) clearTimeout(timers.hold)
    if (timers.repeat !== null) clearInterval(timers.repeat)
    timersRef.current = { hold: null, repeat: null }
  }, [])

  const start = useCallback(() => {
    stop()
    const hold = setTimeout(() => {
      timersRef.current = {
        hold: null,
        repeat: setInterval(() => {
          if (!fireRef.current()) stop()
        }, 120),
      }
    }, 400)
    timersRef.current = { hold, repeat: null }
  }, [stop])

  useEffect(() => stop, [stop])

  return { start, stop }
}

/**
 * 터치 전용 숫자 입력 — 키보드 없이 −/+ 만으로 조작한다.
 * 판 옆에서 한 손으로 쓰는 앱이라 number input 대신 이것을 기본으로 쓴다.
 * 짧은 탭은 1스텝, 길게 누르면 자동 반복. 첫 스텝은 pointerdown 에서 즉시 나가고
 * click 은 키보드 활성화(detail === 0)만 처리해 이중 발화를 막는다.
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
  // 홀드 반복 콜백이 항상 최신 value 를 읽도록 ref 로 추적한다.
  const valueRef = useRef(value)
  useEffect(() => {
    valueRef.current = value
  }, [value])

  const stepBy = (direction: 1 | -1): boolean => {
    const next = Math.min(max, Math.max(min, valueRef.current + direction * step))
    if (next === valueRef.current) return false
    onChange(next)
    return true
  }
  const decreaseHold = useHoldRepeat(() => stepBy(-1))
  const increaseHold = useHoldRepeat(() => stepBy(1))

  const buttonClass =
    'm-1 min-h-12 min-w-12 select-none rounded-lg bg-white/[0.07] text-xl font-bold text-text/80 shadow-[0_1px_0_rgb(255_255_255/0.06)_inset] transition-all touch-manipulation active:scale-95 active:bg-white/15 disabled:cursor-not-allowed disabled:opacity-25'
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
        onPointerDown={(event) => {
          if (event.button !== 0) return
          stepBy(-1)
          decreaseHold.start()
        }}
        onPointerUp={decreaseHold.stop}
        onPointerLeave={decreaseHold.stop}
        onPointerCancel={decreaseHold.stop}
        onClick={(event) => {
          if (event.detail === 0) stepBy(-1)
        }}
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
        onPointerDown={(event) => {
          if (event.button !== 0) return
          stepBy(1)
          increaseHold.start()
        }}
        onPointerUp={increaseHold.stop}
        onPointerLeave={increaseHold.stop}
        onPointerCancel={increaseHold.stop}
        onClick={(event) => {
          if (event.detail === 0) stepBy(1)
        }}
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
