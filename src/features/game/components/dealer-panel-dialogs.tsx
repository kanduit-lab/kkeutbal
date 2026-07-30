'use client'

import { format, useDict } from '@/lib/i18n/client'
import { Button, ConfirmDialog } from '@/components/ui'
import { VOID_REASONS, type VoidReason } from './shared'

/**
 * 판 무효 확인 다이얼로그. 데스크톱 `DealerPanel`과 모바일 `DealerQuickBar`가
 * 같은 사유 선택 UI를 공유하도록 한 곳에 둔다.
 */
export function DealerVoidDialog({
  voidTarget,
  voidReason,
  onSelectReason,
  onConfirm,
  onClose,
  lastResultSeq,
}: {
  voidTarget: 'current' | 'last' | null
  voidReason: VoidReason
  onSelectReason: (reason: VoidReason) => void
  onConfirm: () => void
  onClose: () => void
  lastResultSeq: number | undefined
}) {
  const { d } = useDict()
  return (
    <ConfirmDialog
      open={voidTarget !== null}
      tone="danger"
      title={voidTarget === 'last' ? d.dealer.voidLastTitle : d.dealer.voidCurrentTitle}
      body={
        voidTarget === 'last'
          ? format(d.dealer.voidLastBody, { seq: lastResultSeq ?? 0 })
          : d.dealer.voidCurrentBody
      }
      confirmLabel={d.dealer.voidConfirm}
      cancelLabel={d.common.cancel}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <div className="grid grid-cols-3 gap-2" role="group" aria-label={d.dealer.voidReasonAria}>
        {VOID_REASONS.map((item) => (
          <Button
            key={item.value}
            size="sm"
            selected={voidReason === item.value}
            onClick={() => onSelectReason(item.value)}
          >
            {d.dealer[item.labelKey]}
          </Button>
        ))}
      </div>
    </ConfirmDialog>
  )
}

/** 세션 정산 확인 다이얼로그. 데스크톱 패널과 모바일 딜러 도구 시트가 공유한다. */
export function DealerSettleDialog({
  open,
  onConfirm,
  onClose,
}: {
  open: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const { d } = useDict()
  return (
    <ConfirmDialog
      open={open}
      title={d.dealer.settleConfirmTitle}
      body={d.dealer.settleConfirmBody}
      confirmLabel={d.dealer.settleConfirmLabel}
      cancelLabel={d.common.cancel}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  )
}
