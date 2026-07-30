import { format } from '@/lib/i18n/client'
import type { BetActionKind } from '../types'

/**
 * `ActionBar`가 베팅 버튼을 잠그는 이유(게이트 문구)를 판정하는 순수 함수.
 * `use-action-bar-controls.ts`가 훅 안에서 매 렌더마다 호출한다(원래 action-bar.tsx의
 * `gateReason` 계산이 useMemo 없이 매 렌더 재계산이던 것과 동일하게, 여기서도 메모이제이션
 * 없이 그대로 둔다 — 동작을 바꾸지 않기 위함).
 *
 * 우선순위: 폴드 > 올인 > 딜러 승인 대기 > 내 차례 아님 > (그 외) 동기화 stale 사유.
 * 서버가 실제로 강제하는 턴 검증은 `../turn-order.ts`이고, 이 함수는 그 판정 결과를
 * 문구로만 바꾼다 — 최종 방어선은 서버다.
 */
export interface ActionGateStatus {
  readonly lastAcceptedAction: BetActionKind | null
  readonly hasPendingAction: boolean
  readonly isMyTurn: boolean
  readonly currentActorName: string | null
  readonly staleReason: string | null
}

export interface ActionGateMessages {
  readonly foldedGate: string
  readonly allinGate: string
  readonly pendingGate: string
  readonly notYourTurn: string
}

export function computeActionGateReason(
  status: ActionGateStatus,
  messages: ActionGateMessages,
): string | null {
  if (status.lastAcceptedAction === 'fold') return messages.foldedGate
  if (status.lastAcceptedAction === 'allin') return messages.allinGate
  if (status.hasPendingAction) return messages.pendingGate
  if (!status.isMyTurn) {
    return format(messages.notYourTurn, { name: status.currentActorName ?? '' })
  }
  return status.staleReason
}
