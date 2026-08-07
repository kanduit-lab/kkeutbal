'use client'

import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import { ModalPortal, useModalBehavior } from './modal'

/**
 * 폭은 `className`이 아니라 이 prop으로 고른다. `tailwind-merge`가 없어서 기본 `sm:max-w-md`가
 * 그대로 남고, 둘 중 Tailwind가 나중에 정의한 쪽이 이겨 버린다.
 */
const SHEET_WIDTH = {
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-2xl',
} as const

export function Sheet({
  open,
  onClose,
  ariaLabel,
  width = 'md',
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  ariaLabel: string
  width?: keyof typeof SHEET_WIDTH
  children: ReactNode
  className?: string
}) {
  const { panelRef, rendered, closing, backdropProps } = useModalBehavior(open, onClose)
  if (!rendered) return null
  return (
    <ModalPortal>
      <div
        className={clsx(
          'overlay-in fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4',
          closing && 'overlay-out',
        )}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        {...backdropProps}
      >
        <div
          ref={panelRef}
          tabIndex={-1}
          className={clsx(
            'lacquer sheet-slide-in max-h-[88dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl p-5 focus:outline-none',
            'pb-[max(env(safe-area-inset-bottom),1.25rem)]',
            'sm:panel-pop-in sm:rounded-2xl sm:pb-5',
            SHEET_WIDTH[width],
            closing && 'sheet-slide-out sm:panel-pop-out',
            className,
          )}
        >
          {children}
        </div>
      </div>
    </ModalPortal>
  )
}