'use client'

import { clsx } from 'clsx'
import { useState, useSyncExternalStore } from 'react'
import { Button, ModalPortal, useModalBehavior } from '@/components/ui'
import { useDict, format } from '@/lib/i18n/client'
import {
  isDismissed,
  readDismissals,
  STORAGE_KEY,
  withDismissal,
  writeDismissals,
  type DismissMap,
} from '../dismissal'
import type { PromotionView } from '../types'

const subscribeNever = () => () => {}

/** localStorage는 클라이언트에만 있다. 여러 번 읽지 않도록 마지막 값을 기억한다. */
let lastDismissalSnapshot: DismissMap | null = null
let lastDismissalRaw: string | null = null

function dismissalSnapshot(): DismissMap {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw !== lastDismissalRaw) {
    lastDismissalRaw = raw
    lastDismissalSnapshot = readDismissals()
  }
  return lastDismissalSnapshot ?? {}
}

function applyDismissal(
  promotion: PromotionView,
  dismissals: DismissMap,
  setOverride: (next: DismissMap) => void,
) {
  const next = withDismissal(dismissals, promotion.id, promotion.dismissHours, Date.now())
  writeDismissals(next)
  setOverride(next)
}

export function PromotionHost({ promotions }: { promotions: readonly PromotionView[] }) {
  // 닫기 기록은 localStorage에 있다. 서버 스냅숏(null)과 클라이언트 스냅숏을 나눠 hydration
  // 뒤에 값을 읽으면, effect로 상태를 켜지 않아도 된다. "지금 시각"도 같은 방식으로 읽는다 —
  // `Date.now()`를 렌더 중에 부르면 비순수라서 컴포넌트가 메모이제이션될 수 없다.
  const stored = useSyncExternalStore(subscribeNever, dismissalSnapshot, () => null)
  const now = useSyncExternalStore(subscribeNever, () => Date.now(), () => null)
  const [override, setOverride] = useState<DismissMap | null>(null)
  const dismissals = override ?? stored

  // 닫기 처리는 이벤트 핸들러다. 시각을 렌더 본문의 클로저가 아니라 핸들러에서 읽어야
  // 렌더 경로에 비순수 호출이 남지 않는다.
  const handleDismiss = (promotion: PromotionView) => {
    applyDismissal(promotion, dismissals ?? {}, setOverride)
  }

  if (!dismissals || now === null) return null

  const visible = promotions.filter((promotion) => !isDismissed(dismissals, promotion.id, now))
  const banners = visible.filter((promotion) => promotion.kind === 'banner')
  const popup = visible.find((promotion) => promotion.kind === 'popup') ?? null

  return (
    <>
      {banners.map((banner) => (
        <PromotionBanner key={banner.id} promotion={banner} onDismiss={() => handleDismiss(banner)} />
      ))}
      {popup ? <PromotionPopup promotion={popup} onDismiss={() => handleDismiss(popup)} /> : null}
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