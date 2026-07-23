'use client'

import { useDict } from '@/lib/i18n/client'
import { Button, useModalBehavior } from '@/components/ui'

/**
 * 무효 사유 프리셋 — value 는 서버 voidRound reason 과 round.voided 브로드캐스트에
 * 실리는 정본(한국어) 값, labelKey 는 로케일별 표시용. 저장·중계되는 값은 보는 사람의
 * 로케일과 무관해야 하므로 분리한다.
 */
export const VOID_REASONS = [
  { value: '재경기', labelKey: 'voidReasonRematch' },
  { value: '오입력', labelKey: 'voidReasonMisentry' },
  { value: '패 노출', labelKey: 'voidReasonExposed' },
] as const
export type VoidReason = (typeof VOID_REASONS)[number]['value']

/**
 * 판 무효 확인 다이얼로그 — ConfirmDialog 는 본문 슬롯이 없어 같은 레이아웃으로 별도 구현.
 * 사유 칩(재경기·오입력·패 노출)을 골라 확정한다. 기본값은 재경기.
 */
export function VoidRoundDialog({
  open,
  title,
  body,
  reason,
  onReasonChange,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  body: string
  reason: VoidReason
  onReasonChange: (reason: VoidReason) => void
  onConfirm: () => void
  onClose: () => void
}) {
  const { d } = useDict()
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
        <p className="mt-1.5 text-sm text-muted">{body}</p>
        <div
          className="mt-3 grid grid-cols-3 gap-2"
          role="group"
          aria-label={d.dealer.voidReasonAria}
        >
          {VOID_REASONS.map((item) => (
            <Button
              key={item.value}
              variant={reason === item.value ? 'primary' : 'surface'}
              className={reason === item.value ? undefined : 'border border-white/10'}
              pressed={reason === item.value}
              onClick={() => onReasonChange(item.value)}
            >
              {d.dealer[item.labelKey]}
            </Button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={onClose}>
            {d.common.cancel}
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {d.dealer.voidConfirm}
          </Button>
        </div>
      </div>
    </div>
  )
}
