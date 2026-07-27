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
  staleReason = null,
}: {
  snapshot: RoomSnapshot
  selfId: string
  runAction: RunAction
  /** 스냅샷이 낡아 조작을 잠글 사유. null 이면 정상. */
  staleReason?: string | null
}) {
  const { d } = useDict()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [revertTarget, setRevertTarget] = useState<BetActionView | null>(null)
  /** 확정 후에도 어느 행이 처리 중인지 알아야 스피너를 그 행에만 붙일 수 있다. */
  const [revertingId, setRevertingId] = useState<string | null>(null)
  const accepted = snapshot.actions.filter((action) => action.status === 'accepted').slice(-5)
  if (accepted.length === 0) return null
  const latestAcceptedId = accepted[accepted.length - 1]?.id

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
      {/* 원래는 raw <details>/<summary> 였다 — 탭 타깃이 20px 남짓이고 브라우저 기본
          삼각형이 화투판 테마와 겉돌았다. 명시적 토글 버튼으로 바꿔 48px 을 확보한다. */}
      <div className="rounded-xl bg-bg-deep/60 px-2 py-1.5">
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-between"
          aria-expanded={open}
          pressed={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="text-sm font-medium">{d.dealer.revertSection}</span>
          <span aria-hidden className="text-xs">
            {open ? '▲' : '▼'}
          </span>
        </Button>
        {open ? (
          <div className="mt-2 space-y-1.5 px-1 pb-1">
            {accepted.map((action) => (
              <div key={action.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  #{action.seq} {nameOf(action.userId)} {betLabels[action.action]}{' '}
                  {action.amount > 0 ? action.amount.toLocaleString() : ''}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0"
                  loading={isPending && revertingId === action.id}
                  loadingLabel={d.ui.processing}
                  disabled={action.id !== latestAcceptedId || staleReason !== null}
                  disabledReason={
                    action.id !== latestAcceptedId
                      ? d.errors.revertLatestFirst
                      : (staleReason ?? undefined)
                  }
                  onClick={() => setRevertTarget(action)}
                >
                  {d.dealer.revert}
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
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
          setRevertingId(target.id)
          startTransition(async () => {
            try {
              await runAction(
                // reason 은 원장·브로드캐스트에 저장되는 정본 값 — 로케일과 무관하게 한국어 유지.
                () => revertBet({ actionId: target.id, reason: '딜러 정정' }),
                () => ({
                  event: 'bet.reverted',
                  payload: { actionId: target.id, revertedBy: selfId, reason: '딜러 정정' },
                }),
              )
            } finally {
              setRevertingId(null)
            }
          })
        }}
        onClose={() => setRevertTarget(null)}
      />
    </>
  )
}
