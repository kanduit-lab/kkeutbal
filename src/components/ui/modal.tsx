'use client'

import { clsx } from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { Button } from './button'

/** 퇴장 애니메이션 길이. globals.css 의 `*-out` 지속시간과 반드시 같아야 한다. */
const EXIT_MS = 180

/* ── Modal behavior ──────────────────────────────────────── */

/**
 * 모달 공통 동작 — 열리면 패널로 포커스 이동, body 스크롤 잠금, Escape 닫기,
 * 최소한의 Tab 포커스 트랩. 반환된 ref 를 패널 요소에 tabIndex={-1} 과 함께 단다.
 * 패널 내부가 스크롤되면 그 스크롤 요소에 `overscroll-contain` 을 줘서
 * 끝까지 스크롤했을 때 배경으로 스크롤이 새는 것(chaining)을 막을 것.
 *
 * **언마운트 시점은 이 훅이 소유한다.** 호출자는 `open` 이 아니라 반환된 `rendered` 로
 * `return null` 을 판단해야 한다 — `open` 으로 판단하면 DOM 이 즉시 사라져 퇴장
 * 애니메이션이 재생될 틈이 없다. 닫히는 동안에는 `closing` 이 true 이므로 패널에
 * `*-out` 클래스를 붙이면 된다.
 *
 * 사용:
 *   const { panelRef, rendered, closing } = useModalBehavior(open, onClose)
 *   if (!rendered) return null
 *   <div className={clsx('overlay-in', closing && 'overlay-out')}>
 */
export function useModalBehavior(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [rendered, setRendered] = useState(open)
  const [closing, setClosing] = useState(false)
  // onClose 가 렌더마다 새 함수여도 포커스·스크롤 잠금 효과가 재실행되지 않게 ref 로 고정.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // open 이 꺼져도 퇴장 애니메이션이 끝날 때까지 DOM 을 남긴다.
  useEffect(() => {
    if (open) {
      setRendered(true)
      setClosing(false)
      return
    }
    if (!rendered) return
    setClosing(true)
    const timer = window.setTimeout(() => {
      setRendered(false)
      setClosing(false)
    }, EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [open, rendered])

  useEffect(() => {
    // 닫히는 중에는 트랩·스크롤 잠금을 풀어 둔다 — 이미 사용자 입력을 받지 않는 구간이다.
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
  }, [rendered, closing])

  return { panelRef, rendered, closing }
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
  const { panelRef, rendered, closing } = useModalBehavior(open, onClose)
  if (!rendered) return null
  return (
    <div
      className={clsx(
        'overlay-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4',
        closing && 'overlay-out',
      )}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={clsx(
          'lacquer panel-pop-in w-full max-w-sm rounded-2xl p-5 focus:outline-none',
          closing && 'panel-pop-out',
        )}
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
