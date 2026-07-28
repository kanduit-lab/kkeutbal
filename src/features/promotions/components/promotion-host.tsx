'use client'

import { clsx } from 'clsx'
import { useEffect, useState } from 'react'
import { Button, ModalPortal, useModalBehavior } from '@/components/ui'
import { useDict, format } from '@/lib/i18n/client'
import {
  isDismissed,
  readDismissals,
  withDismissal,
  writeDismissals,
  type DismissMap,
} from '../dismissal'
import type { PromotionView } from '../types'

export function PromotionHost({ promotions }: { promotions: readonly PromotionView[] }) {
  const [dismissals, setDismissals] = useState<DismissMap | null>(null)

  useEffect(() => {
    setDismissals(readDismissals())
  }, [])

  const dismiss = (promotion: PromotionView) => {
    const next = withDismissal(dismissals ?? {}, promotion.id, promotion.dismissHours, Date.now())
    writeDismissals(next)
    setDismissals(next)
  }

  if (!dismissals) return null

  const now = Date.now()
  const visible = promotions.filter((promotion) => !isDismissed(dismissals, promotion.id, now))
  const banners = visible.filter((promotion) => promotion.kind === 'banner')
  const popup = visible.find((promotion) => promotion.kind === 'popup') ?? null

  return (
    <>
      {banners.map((banner) => (
        <PromotionBanner key={banner.id} promotion={banner} onDismiss={() => dismiss(banner)} />
      ))}
      {popup ? <PromotionPopup promotion={popup} onDismiss={() => dismiss(popup)} /> : null}
    </>
  )
}

function PromotionBanner({
  promotion,
  onDismiss,
}: {
  promotion: PromotionView
  onDismiss: () => void
}) {
  const { d } = useDict()
  return (
    <aside className="rise-in flex items-center gap-3 border-b border-gold/20 bg-gold/10 px-4 py-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <span className="font-bold">{promotion.title}</span>
        {promotion.body ? <span className="ml-2 text-muted">{promotion.body}</span> : null}
        {promotion.linkUrl ? (
          <a
            href={promotion.linkUrl}
            className="ml-2 font-bold text-text underline underline-offset-4"
          >
            {promotion.linkLabel ?? d.promo.learnMore}
          </a>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={format(d.promo.dismissFor, { hours: promotion.dismissHours })}
        title={format(d.promo.dismissFor, { hours: promotion.dismissHours })}

        className="-m-1 inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-lg leading-none text-muted hover:text-text"
      >
        <span aria-hidden="true">×</span>
      </button>
    </aside>
  )
}

function PromotionPopup({
  promotion,
  onDismiss,
}: {
  promotion: PromotionView
  onDismiss: () => void
}) {
  const { d } = useDict()

  const [closed, setClosed] = useState(false)
  const { panelRef, rendered, closing, backdropProps } = useModalBehavior(!closed, () =>
    setClosed(true),
  )
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
        aria-label={promotion.title}
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
          <p className="font-brush text-xl font-black">{promotion.title}</p>
          {promotion.body ? (
            <p className="mt-2 whitespace-pre-line text-sm text-muted">{promotion.body}</p>
          ) : null}
          {promotion.linkUrl ? (
            <a
              href={promotion.linkUrl}
              className="mt-3 inline-block font-bold text-text underline underline-offset-4"
            >
              {promotion.linkLabel ?? d.promo.learnMore}
            </a>
          ) : null}
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={onDismiss}>
              {format(d.promo.dismissFor, { hours: promotion.dismissHours })}
            </Button>
            <Button variant="primary" onClick={() => setClosed(true)}>
              {d.promo.close}
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}