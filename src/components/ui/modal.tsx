'use client'

import { clsx } from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { Button } from './button'

const EXIT_MS = 180

export function useModalBehavior(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  // 열림 상태는 effect 없이 바로 계산한다 — 닫힐 때만 사라지는 애니메이션을 위해 exit 상태를 둔다.
  const [exiting, setExiting] = useState(false)
  const rendered = open || exiting
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (!open) setExiting(true)
    else setExiting(false)
  }

  const pressedBackdrop = useRef(false)

  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!exiting) return
    const timer = window.setTimeout(() => setExiting(false), EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [exiting])

  const closing = exiting

  useEffect(() => {
    if (!rendered || closing) return
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
  }, [rendered, closing])

  const backdropProps = {
    onPointerDown: (event: React.PointerEvent) => {
      pressedBackdrop.current = event.target === event.currentTarget
    },
    onClick: (event: React.MouseEvent) => {
      if (pressedBackdrop.current && event.target === event.currentTarget) onCloseRef.current()
    },
  }

  return { panelRef, rendered, closing, backdropProps }
}

export function ModalPortal({ children }: { children: ReactNode }) {
  // `document.body`는 렌더 중에 읽어도 되는 값이다 (SSR에는 없어서 렌더 단계에서 null).
  // effect에서 setState로 넘기면 첫 프레임이 비었다가 다시 그려지므로 렌더 중에 바로 판단한다.
  const host = typeof document === 'undefined' ? null : document.body
  return host ? createPortal(children, host) : null
}

export function ConfirmDialog({
  open,
  title,
  body,
  children,
  confirmLabel,
  cancelLabel = '취소',
  confirmDisabled = false,
  loading = false,
  tone = 'primary',
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string

  body?: ReactNode

  children?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  confirmDisabled?: boolean
  loading?: boolean
  tone?: 'primary' | 'danger'
  onConfirm: () => void
  onClose: () => void
}) {
  const { panelRef, rendered, closing, backdropProps } = useModalBehavior(open, onClose)
  if (!rendered) return null
  return (
    <ModalPortal>
      <div
        className={clsx(
          'overlay-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4',
          closing && 'overlay-out',
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        {...backdropProps}
      >
        <div
          ref={panelRef}
          tabIndex={-1}
          className={clsx(
            'lacquer panel-pop-in max-h-[85dvh] w-full max-w-sm overflow-y-auto overscroll-contain rounded-2xl p-5 focus:outline-none',
            closing && 'panel-pop-out',
          )}
        >
          <p className="font-bold">{title}</p>
          {body ? <div className="mt-1.5 text-sm text-muted">{body}</div> : null}
          {children ? <div className="mt-3">{children}</div> : null}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={onClose} disabled={loading}>
              {cancelLabel}
            </Button>
            <Button
              variant={tone === 'danger' ? 'danger' : 'primary'}
              onClick={onConfirm}
              disabled={confirmDisabled}
              loading={loading}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}