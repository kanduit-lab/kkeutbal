'use client'

import { useState, useTransition } from 'react'
import { approveBet, rejectBet } from '@/features/betting/actions'
import { format, useDict } from '@/lib/i18n/client'
import type { BetActionKind, BetActionView } from '../types'
import { Button, Input } from '@/components/ui'
import type { RunAction } from './shared'

export function PendingApprovalQueue({
  pendingActions,
  selfId,
  runAction,
  nameOf,
  betLabels,
  staleReason = null,
}: {
  pendingActions: readonly BetActionView[]
  selfId: string
  runAction: RunAction
  nameOf: (userId: string) => string
  betLabels: Record<BetActionKind, string>

  staleReason?: string | null
}) {
  const { d } = useDict()
  const [isPending, startTransition] = useTransition()
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const [firing, setFiring] = useState<{ id: string; kind: 'approve' | 'reject' } | null>(null)

  if (pendingActions.length === 0) return null

  const run = (
    target: { id: string; kind: 'approve' | 'reject' },
    task: () => Promise<unknown>,
  ) => {
    if (isPending) return
    setFiring(target)
    startTransition(async () => {
      try {
        await task()
      } finally {
        setFiring(null)
      }
    })
  }

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-bold text-warn">
        {format(d.dealer.pendingCount, { n: pendingActions.length })}
      </p>
      {pendingActions.map((action) => (
        <div key={action.id} className="rounded-xl bg-bg-deep/60 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">
              <span className="font-medium">{nameOf(action.userId)}</span>{' '}
              <span className="font-bold">{betLabels[action.action]}</span>{' '}
              {action.amount > 0 ? (
                <span className="tabular-nums text-warn">{action.amount.toLocaleString()}</span>
              ) : null}
            </span>
            <span className="flex gap-1.5">
              <Button
                size="md"
                variant="win"
                loading={firing?.id === action.id && firing.kind === 'approve'}
                loadingLabel={d.ui.processing}
                disabled={isPending || staleReason !== null}
                disabledReason={staleReason ?? undefined}
                onClick={() =>
                  run({ id: action.id, kind: 'approve' }, () =>
                    runAction(
                      () => approveBet({ actionId: action.id }),
                      (data) =>
                        data.action.status === 'accepted'
                          ? {
                              event: 'bet.approved',
                              payload: { actionId: action.id, approvedBy: selfId },
                            }
                          : {
                              event: 'bet.rejected',
                              payload: {
                                actionId: action.id,
                                rejectedBy: selfId,
                                reason: data.action.reason ?? 'errors.approveBetFailed',
                              },
                            },
                    ),
                  )
                }
              >
                {d.dealer.approve}
              </Button>
              <Button
                size="md"
                variant="danger"
                disabled={isPending || staleReason !== null}
                disabledReason={staleReason ?? undefined}
                aria-expanded={rejectingId === action.id}
                onClick={() => {
                  setRejectingId(rejectingId === action.id ? null : action.id)
                  setRejectReason('')
                }}
              >
                {d.dealer.reject}
              </Button>
            </span>
          </div>
          {rejectingId === action.id ? (
            <div className="mt-2 flex gap-1.5">
              <Input
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder={d.dealer.rejectReasonPlaceholder}
                maxLength={200}
                className="min-h-11 text-base"
              />
              <Button
                size="md"
                variant="danger"
                loading={firing?.id === action.id && firing.kind === 'reject'}
                loadingLabel={d.ui.processing}
                disabled={rejectReason.trim().length === 0 || staleReason !== null}
                disabledReason={
                  rejectReason.trim().length === 0
                    ? d.dealer.reasonRequired
                    : (staleReason ?? undefined)
                }
                onClick={() =>
                  run({ id: action.id, kind: 'reject' }, async () => {
                    const reason = rejectReason.trim()
                    const success = await runAction(
                      () => rejectBet({ actionId: action.id, reason }),
                      () => ({
                        event: 'bet.rejected',
                        payload: { actionId: action.id, rejectedBy: selfId, reason },
                      }),
                    )
                    if (success) setRejectingId(null)
                  })
                }
              >
                {d.common.confirm}
              </Button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}