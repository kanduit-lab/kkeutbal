'use client'

import { useState, useTransition } from 'react'
import { revertBet } from '@/features/betting/actions'
import { format, useDict } from '@/lib/i18n/client'
import type { BetActionView, RoomSnapshot } from '../types'
import { Button, ConfirmDialog } from '@/components/ui'
import type { RunAction } from './shared'

export function RevertList({
  snapshot,
  selfId,
  runAction,
}: {
  snapshot: RoomSnapshot
  selfId: string
  runAction: RunAction
}) {
  const { d } = useDict()
  const [isPending, startTransition] = useTransition()
  const [revertTarget, setRevertTarget] = useState<BetActionView | null>(null)
  const accepted = snapshot.actions.filter((action) => action.status === 'accepted').slice(-5)
  if (accepted.length === 0) return null

  const betLabels = d.bet[snapshot.room.gameType === 'poker' ? 'poker' : 'seotda']
  const nameOf = (userId: string) =>
    snapshot.members.find((member) => member.userId === userId)?.displayName ?? '?'

  const revertTitle = revertTarget
    ? format(d.dealer.revertConfirmTitle, {
        target: format(d.dealer.revertTarget, {
          name: nameOf(revertTarget.userId),
          label: betLabels[revertTarget.action],
          amount: revertTarget.amount > 0 ? revertTarget.amount.toLocaleString() : '',
        }).trim(),
      })
    : ''

  return (
    <>
      <details className="rounded-xl bg-bg-deep/60 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-muted">
          {d.dealer.revertSection}
        </summary>
        <div className="mt-2 space-y-1.5">
          {accepted.map((action) => (
            <div key={action.id} className="flex items-center justify-between text-sm">
              <span>
                #{action.seq} {nameOf(action.userId)} {betLabels[action.action]}{' '}
                {action.amount > 0 ? action.amount.toLocaleString() : ''}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={isPending}
                onClick={() => setRevertTarget(action)}
              >
                {d.dealer.revert}
              </Button>
            </div>
          ))}
        </div>
      </details>
      <ConfirmDialog
        open={revertTarget !== null}
        title={revertTitle}
        body={d.dealer.revertConfirmBody}
        confirmLabel={d.dealer.revert}
        cancelLabel={d.common.cancel}
        onConfirm={() => {
          const target = revertTarget
          setRevertTarget(null)
          if (!target || isPending) return
          startTransition(async () => {
            await runAction(
              // reason 은 원장·브로드캐스트에 저장되는 정본 값 — 로케일과 무관하게 한국어 유지.
              () => revertBet({ actionId: target.id, reason: '딜러 정정' }),
              () => ({
                event: 'bet.reverted',
                payload: { actionId: target.id, revertedBy: selfId, reason: '딜러 정정' },
              }),
            )
          })
        }}
        onClose={() => setRevertTarget(null)}
      />
    </>
  )
}
