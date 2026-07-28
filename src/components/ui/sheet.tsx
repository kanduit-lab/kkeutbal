'use client'

import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import { ModalPortal, useModalBehavior } from './modal'

export function Sheet({
  open,
  onClose,
  ariaLabel,
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  ariaLabel: string
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
            'sm:panel-pop-in sm:max-w-md sm:rounded-2xl sm:pb-5',
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