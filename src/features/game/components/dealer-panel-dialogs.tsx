'use client'

import { format, useDict, type Dictionary } from '@/lib/i18n/client'
import { Button, ConfirmDialog } from '@/components/ui'
import { VOID_REASONS, type VoidReason, type VoidTarget } from './shared'

function titleFor(target: VoidTarget | null, dealer: Dictionary['dealer']): string {
  if (target === 'last') return dealer.voidLastTitle
  if (target === 'replay') return dealer.voidReplayTitle
  return dealer.voidCurrentTitle
}

/**
 * 판돈 처리가 사유에 따라 갈리므로(`docs/04-game-engines.md`) 본문도 사유를 따라간다 —
 * `재경기`는 다음 판으로 이월, 나머지는 전액 환불. 지난 판 취소는 이미 승부가 났던 판이라
 * 언제나 환불이다.
 */
function bodyFor(
  target: VoidTarget | null,
  reason: VoidReason,
  dealer: Dictionary['dealer'],
  lastResultSeq: number | undefined,
): string {
  if (target === 'last') return format(dealer.voidLastBody, { seq: lastResultSeq ?? 0 })
  if (reason !== '재경기') return dealer.voidRefundBody
  return target === 'replay' ? dealer.voidReplayBody : dealer.voidCurrentBody
}

/**
 * 판 무효 확인 다이얼로그. 데스크톱 `DealerPanel`과 모바일 `DealerQuickBar`가
 * 같은 사유 선택 UI를 공유하도록 한 곳에 둔다.
 *
 * `voidTarget === 'replay'`는 승부가 안 난 판(섯다 구사·무승부, 고스톱 나가리)이다 —
 * 대상 판은 `current`와 같고 문구만 "왜 재경기인가"를 설명한다.
 */
export function DealerVoidDialog({
  voidTarget,
  voidReason,
  onSelectReason,
  onConfirm,
  onClose,
  lastResultSeq,
}: {
  voidTarget: VoidTarget | null
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
      title={titleFor(voidTarget, d.dealer)}
      body={bodyFor(voidTarget, voidReason, d.dealer, lastResultSeq)}
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
