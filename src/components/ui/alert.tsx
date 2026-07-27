'use client'

import { clsx } from 'clsx'
import type { ReactNode } from 'react'

/**
 * 폼·액션 실패를 알리는 배너. 같은 실패 종류가 화면마다 다른 모양(꽉 찬 배너 / 작은 빨간 글씨)으로
 * 나오고 절반은 ARIA role 이 없어서 스크린리더에 아예 안 읽히던 걸 하나로 모은다.
 *
 * error 는 role="alert"(assertive) — 사용자가 방금 한 동작이 실패했으므로 즉시 알려야 한다.
 * 나머지 톤은 role="status"(polite).
 */
export function Alert({
  tone,
  title,
  children,
  className,
}: {
  tone: 'error' | 'warn' | 'success' | 'info'
  title?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={clsx(
        'rounded-xl border px-4 py-3 text-sm font-medium',
        tone === 'error' && 'border-accent/30 bg-danger-surface text-danger',
        tone === 'warn' && 'border-gold/30 bg-gold/10 text-warn',
        tone === 'success' && 'border-win/30 bg-success-surface text-success-fg',
        tone === 'info' && 'border-gold/20 bg-surface-raised text-text',
        className,
      )}
    >
      {title ? <p className="font-bold">{title}</p> : null}
      <div className={clsx(title && 'mt-1 font-normal opacity-90')}>{children}</div>
    </div>
  )
}
