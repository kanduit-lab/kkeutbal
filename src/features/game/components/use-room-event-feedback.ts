'use client'

import { useCallback } from 'react'
import { format, translateError, useDict } from '@/lib/i18n/client'
import type { RoomEvent } from '@/lib/realtime/events'
import { playChip, playRoundStart, playWin } from '@/lib/sound'
import { useToast } from '@/components/ui'
import type { RoomSnapshot } from '../types'
import { isKnownVoidReason } from './shared'

export function useRoomEventFeedback(selfId: string) {
  const { toast } = useToast()
  const { d } = useDict()

  return useCallback(
    (event: RoomEvent, current: RoomSnapshot) => {
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
          const winner = current.members.find((member) => member.userId === event.payload.winnerId)
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