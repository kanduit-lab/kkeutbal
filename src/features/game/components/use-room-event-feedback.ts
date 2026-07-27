'use client'

import { useCallback } from 'react'
import { format, translateError, useDict } from '@/lib/i18n/client'
import type { RoomEvent } from '@/lib/realtime/events'
import { playChip, playRoundStart, playWin } from '@/lib/sound'
import { useToast } from '@/components/ui'
import type { RoomSnapshot } from '../types'
import { isKnownVoidReason } from './shared'

/**
 * 수신 브로드캐스트의 표시용 반응(토스트·사운드)만 담당한다.
 * 상태 반영은 useRoomSync 의 스냅샷 refetch 가 소유한다 — 이벤트는 힌트일 뿐이다.
 *
 * 채널은 공개이므로(docs/03-realtime-protocol.md) 페이로드 문자열은 zod 스키마를 통과한
 * 뒤에도 "우리가 쓴 문장"이 아니다. 자유 텍스트를 앱 문구로 그대로 승격하지 않는다.
 */
export function useRoomEventFeedback(selfId: string) {
  const { toast } = useToast()
  const { d } = useDict()

  return useCallback(
    (event: RoomEvent, current: RoomSnapshot) => {
      /** 내 액션에만 개인 피드백을 띄운다 — 승인·거절·되돌림 공용 판정. */
      const isMyAction = (actionId: string) =>
        current.actions.some((action) => action.id === actionId && action.userId === selfId)

      switch (event.name) {
        case 'bet.placed':
          if (event.payload.amount > 0) playChip()
          break
        case 'bet.approved':
          if (isMyAction(event.payload.actionId)) toast(d.room.toastBetApproved, 'success')
          break
        case 'bet.rejected':
          if (isMyAction(event.payload.actionId)) {
            toast(
              format(d.room.toastBetRejected, {
                reason: translateError(d, event.payload.reason),
              }),
              'error',
            )
          }
          break
        case 'bet.reverted':
          if (isMyAction(event.payload.actionId)) {
            toast(
              format(d.room.toastBetReverted, {
                reason: translateError(d, event.payload.reason),
              }),
              'error',
            )
          }
          break
        case 'round.started':
          toast(format(d.room.toastRoundStarted, { seq: event.payload.seq }), 'info')
          playRoundStart()
          break
        case 'round.ended': {
          const winner = current.members.find(
            (member) => member.userId === event.payload.winnerId,
          )
          if (winner) {
            toast(
              format(d.room.toastRoundWon, {
                name: winner.displayName,
                pot: event.payload.pot.toLocaleString(),
              }),
              'success',
            )
            playWin()
          }
          break
        }
        case 'round.voided': {
          // 무효는 전원의 베팅을 되돌린다 — 전원에게 알린다. 다만 사유는 우리 프리셋
          // 화이트리스트를 통과한 값만 문장에 넣는다. 방 UUID 를 아는 누구나 임의의
          // 200자 문자열을 실을 수 있고, 그걸 그대로 띄우면 앱이 쓴 에러로 읽힌다.
          const { seq, reason } = event.payload
          toast(
            isKnownVoidReason(reason)
              ? format(d.room.toastRoundVoided, { seq, reason })
              : format(d.room.toastRoundVoidedNoReason, { seq }),
            'error',
          )
          break
        }
        default:
          break
      }
    },
    [selfId, toast, d],
  )
}
