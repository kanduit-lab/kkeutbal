'use client'

import { clsx } from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
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
  // 바깥 클릭 판정용 — 패널 안에서 누르고 배경에서 뗀 드래그는 닫지 않는다.
  const pressedBackdrop = useRef(false)
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

  /**
   * 배경 요소에 그대로 펼친다. click 만 쓰면 패널 안(예: Stepper 의 −/+)에서 누르고
   * 손가락이 미끄러져 배경에서 떼는 순간 click 이 배경에 직접 떨어져 시트가 통째로 닫힌다
   * — 입력하던 바이인 금액이 함께 날아간다. pointerdown 위치를 같이 본다.
   */
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

/**
 * 오버레이를 body 로 포탈한다. 조상에 transform/filter 가 걸려 있으면
 * position: fixed 가 그 조상 기준으로 잡혀 전체화면 다이얼로그가 컬럼 안에 갇힌다.
 * SSR 에서는 document 가 없으므로 마운트 후에만 렌더한다.
 */
export function ModalPortal({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => setHost(document.body), [])
  return host ? createPortal(children, host) : null
}

/** 확인 다이얼로그 — window.confirm 대체. 바깥 클릭·취소·Escape 로 닫힌다. */
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
  /** 결과와 범위를 문장으로 적는다 (ui-states-and-feedback). 노드도 받는다. */
  body?: ReactNode
  /** 본문과 버튼 줄 사이의 자유 슬롯 — 사유 선택 같은 구조적 내용을 넣는다. */
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
