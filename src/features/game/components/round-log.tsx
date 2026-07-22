'use client'

import type { BetActionView, MemberView } from '../types'
import { Badge, EmptyState } from '@/components/ui'
import { BET_LABELS } from './shared'

const STATUS_BADGE: Record<
  BetActionView['status'],
  { label: string; tone: 'muted' | 'win' | 'warn' | 'accent' } | null
> = {
  accepted: null, // 확정이 기본값이라 표시하지 않는다 — 예외만 눈에 띄게
  pending: { label: '승인 대기', tone: 'warn' },
  rejected: { label: '거절됨', tone: 'accent' },
  reverted: { label: '정정됨', tone: 'muted' },
}

/** 현재 판 액션 로그. 최근 것이 위. */
export function RoundLog({
  actions,
  members,
}: {
  actions: readonly BetActionView[]
  members: readonly MemberView[]
}) {
  const nameOf = (userId: string) =>
    members.find((member) => member.userId === userId)?.displayName ?? '?'

  return (
    <section className="mb-4 space-y-1.5">
      <h2 className="px-1 text-sm font-bold text-muted">이번 판 기록</h2>
      {actions.length === 0 ? (
        <EmptyState title="아직 액션이 없습니다" />
      ) : (
        <ul className="max-h-48 space-y-1.5 overflow-y-auto">
          {[...actions].reverse().map((action) => {
            const badge = STATUS_BADGE[action.status]
            return (
              <li
                key={action.id}
                className="flex items-center justify-between rounded-xl bg-surface px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <span className="text-muted">#{action.seq}</span>
                  <span className="font-medium">{nameOf(action.userId)}</span>
                  <span className="font-bold">{BET_LABELS[action.action]}</span>
                  {action.amount > 0 ? (
                    <span className="tabular-nums text-warn">
                      {action.amount.toLocaleString()}
                    </span>
                  ) : null}
                  {action.enteredBy ? (
                    <span className="text-[11px] text-muted">
                      (대리: {nameOf(action.enteredBy)})
                    </span>
                  ) : null}
                </span>
                {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
