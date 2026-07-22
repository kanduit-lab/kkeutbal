'use client'

import { clsx } from 'clsx'
import type { MemberView } from '../types'
import { Badge } from '@/components/ui'

const ROLE_LABELS: Record<MemberView['role'], string | null> = {
  host: '방장',
  dealer: '딜러',
  player: null,
  observer: '관전',
}

export function ParticipantGrid({
  members,
  online,
  selfId,
  winnerId,
}: {
  members: readonly MemberView[]
  online: ReadonlySet<string>
  selfId: string
  winnerId: string | null
}) {
  return (
    <section className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {members.map((member) => {
        const isSelf = member.userId === selfId
        const isOnline = online.has(member.userId)
        const roleLabel = ROLE_LABELS[member.role]
        const net = member.balance - member.buyInTotal
        return (
          <div
            key={member.userId}
            className={clsx(
              'lacquer rounded-2xl px-4 py-3.5',
              isSelf && 'ring-1 ring-gold/50',
              winnerId === member.userId && 'ring-2 ring-win',
            )}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={clsx(
                  'size-2 shrink-0 rounded-full',
                  isOnline ? 'bg-win shadow-[0_0_6px_var(--color-win)]' : 'bg-white/20',
                )}
                title={isOnline ? '접속 중' : '오프라인'}
              />
              <p className="truncate font-bold leading-tight">
                {member.displayName}
                {isSelf ? <span className="ml-1 text-xs font-medium text-gold">나</span> : null}
              </p>
              {roleLabel ? <Badge tone="accent">{roleLabel}</Badge> : null}
            </div>
            <p
              className={clsx(
                'mt-1.5 text-2xl font-black tabular-nums',
                member.balance <= 0 ? 'text-accent' : 'gilt',
              )}
            >
              {member.balance.toLocaleString()}
            </p>
            <p className="mt-0.5 text-[11px] text-muted">
              바이인 {member.buyInTotal.toLocaleString()} · 손익{' '}
              <span className={net >= 0 ? 'text-win' : 'text-accent'}>
                {net >= 0 ? '+' : ''}
                {net.toLocaleString()}
              </span>
            </p>
          </div>
        )
      })}
    </section>
  )
}
