'use client'

import { useEffect, useRef } from 'react'
import { Button } from './button'

/* ── Modal behavior ──────────────────────────────────────── */

/**
 * 모달 공통 동작 — 열리면 패널로 포커스 이동, body 스크롤 잠금, Escape 닫기,
 * 최소한의 Tab 포커스 트랩. 반환된 ref 를 패널 요소에 tabIndex={-1} 과 함께 단다.
 * 패널 내부가 스크롤되면 그 스크롤 요소에 `overscroll-contain` 을 줘서
 * 끝까지 스크롤했을 때 배경으로 스크롤이 새는 것(chaining)을 막을 것.
 *
 * 퇴장 애니메이션 관련 메모: 이 훅은 `open` 이 true→false 로 바뀌는 순간의
 * DOM 언마운트 시점을 제어하지 못한다 — 언마운트 여부는 호출자가
 * `if (!open) return null` 로 직접 결정한다. dealer-panel.tsx, member-sheet.tsx,
 * promotion-host.tsx 는 모두 이 패턴으로 훅의 반환값과 무관하게 즉시 언마운트하므로,
 * 그 세 파일을 건드리지 않는 한 이 훅만으로는 퇴장 애니메이션을 도입할 수 없다.
 * (자세한 내용은 이 스플릿 작업의 리포트 참고.)
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
      className="overlay-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="lacquer panel-pop-in w-full max-w-sm rounded-2xl p-5 focus:outline-none"
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
