'use client'

import { clsx } from 'clsx'
import type { BetActionView, MemberView, RoomGameType } from '../types'
import { Badge, EmptyState } from '@/components/ui'
import { format, translateError, useDict } from '@/lib/i18n/client'
import { betLabelsFor } from './shared'

/** 전광판은 스크롤이 없다 — 최근 몇 개만 크게 보여준다. */
const BOARD_MAX_ENTRIES = 8

/** 현재 판 액션 로그. 최근 것이 위. */
export function RoundLog({
  actions,
  members,
  scale = 'default',
  gameType = 'seotda',
}: {
  actions: readonly BetActionView[]
  members: readonly MemberView[]
  /** 'board' = 전광판 확대 렌더 — 최근 8개만, 스크롤 케이지 없이. */
  scale?: 'default' | 'board'
  /** 액션 표기용 — 섯다는 다이, 포커는 폴드. */
  gameType?: RoomGameType
}) {
  const { d } = useDict()
  const board = scale === 'board'
  const labels = betLabelsFor(gameType, d)
  const nameOf = (userId: string) =>
    members.find((member) => member.userId === userId)?.displayName ?? '?'

  /** 확정(accepted)이 기본값이라 뱃지를 달지 않는다 — 예외 상태만 눈에 띄게. */
  const statusBadge: Record<
    BetActionView['status'],
    { label: string; tone: 'muted' | 'win' | 'warn' | 'accent' } | null
  > = {
    accepted: null,
    pending: { label: d.roundLog.statusPending, tone: 'warn' },
    rejected: { label: d.roundLog.statusRejected, tone: 'accent' },
    reverted: { label: d.roundLog.statusReverted, tone: 'muted' },
  }

  const rows = board
    ? [...actions].reverse().slice(0, BOARD_MAX_ENTRIES)
    : [...actions].reverse()

  return (
    <section className="mb-4 space-y-1.5">
      <h2 className={clsx('px-1 font-bold text-muted', board ? 'text-lg' : 'text-sm')}>
        {d.roundLog.title}
      </h2>
      {actions.length === 0 ? (
        <EmptyState title={d.roundLog.empty} />
      ) : (
        <ul className={clsx('space-y-1.5', !board && 'max-h-48 overflow-y-auto')}>
          {rows.map((action) => {
            const badge = statusBadge[action.status]
            const showReason =
              (action.status === 'rejected' || action.status === 'reverted') &&
              Boolean(action.reason)
            return (
              <li
                key={action.id}
                className={clsx(
                  'rounded-xl bg-surface px-3 py-2',
                  board ? 'text-lg sm:text-xl' : 'text-sm',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="text-muted">#{action.seq}</span>
                    <span className="font-medium">{nameOf(action.userId)}</span>
                    <span className="font-bold">{labels[action.action]}</span>
                    {action.amount > 0 ? (
                      <span className="tabular-nums text-warn">
                        {action.amount.toLocaleString()}
                      </span>
                    ) : null}
                    {action.enteredBy ? (
                      <span className={clsx('text-muted', board ? 'text-sm' : 'text-[11px]')}>
                        ({format(d.roundLog.proxyBy, { name: nameOf(action.enteredBy) })})
                      </span>
                    ) : null}
                  </span>
                  {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
                </div>
                {showReason ? (
                  <p className={clsx('mt-0.5 text-muted', board ? 'text-sm' : 'text-[11px]')}>
                    {format(d.roundLog.reasonLine, {
                      reason: translateError(d, action.reason ?? ''),
                    })}
                  </p>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
