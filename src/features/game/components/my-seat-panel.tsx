'use client'

import { clsx } from 'clsx'
import { useMemo } from 'react'
import { Avatar, Badge } from '@/components/ui'
import { contributedBy, roundBetState } from '@/features/betting/round-bet-state'
import { useDict } from '@/lib/i18n/client'
import type { MemberView, RoomSnapshot } from '../types'
import { nextActorId as computeNextActorId } from '../turn-order'
import { ACTION_BADGE, betLabelsFor, formatChips, lastAcceptedByUser } from './shared'
import { ChipStack } from './game-table-chips'

/**
 * 펠트 밖으로 뺀 내 좌석. 폰에서는 좌석 카드가 타원 위에서 서로 겹쳐 내 정보가 가장 먼저
 * 묻혔다 — 여기서는 폭을 다 쓰므로 잔액·손익·이번 판 베팅을 한눈에 보여줄 수 있다.
 * 데스크톱은 펠트에 자리가 남아 그대로 두므로 이 패널을 쓰지 않는다.
 */
export function MySeatPanel({
  self,
  snapshot,
  isOnline,
}: {
  self: MemberView
  snapshot: RoomSnapshot
  isOnline: boolean
}) {
  const { d, locale } = useDict()
  const labels = betLabelsFor(snapshot.room.gameType, d)

  const last = useMemo(
    () => lastAcceptedByUser(snapshot.actions).get(self.userId) ?? null,
    [snapshot.actions, self.userId],
  )
  const pending = useMemo(
    () =>
      snapshot.actions.find(
        (action) => action.status === 'pending' && action.userId === self.userId,
      ) ?? null,
    [snapshot.actions, self.userId],
  )
  const contribution = useMemo(
    () => contributedBy(roundBetState(snapshot.actions), self.userId),
    [snapshot.actions, self.userId],
  )

  const participantIds = useMemo(
    () => snapshot.members.filter((m) => m.role !== 'observer').map((m) => m.userId),
    [snapshot.members],
  )
  const isMyTurn = useMemo(
    () =>
      Boolean(snapshot.currentRound) &&
      computeNextActorId(participantIds, snapshot.actions) === self.userId,
    [snapshot.currentRound, participantIds, snapshot.actions, self.userId],
  )

  const net = self.balance - self.buyInTotal
  const folded = last?.action === 'fold'

  return (
    // 이 줄은 반드시 줄바꿈돼야 한다. 한 줄로 묶으면 좁은 폰에서 패널이 뷰포트보다 넓어지고
    // 그 초과분이 그대로 가로 넘침이 된다.
    <div
      className={clsx(
        'flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border px-3 py-2 backdrop-blur-sm',
        folded ? 'border-white/5 bg-black/40 opacity-60' : 'border-gold/40 bg-black/50',
        isMyTurn && 'ring-2 ring-gold shadow-[0_0_14px_rgb(229_185_84/0.35)]',
      )}
    >
      <div className="relative shrink-0">
        <Avatar name={self.displayName} url={self.avatarUrl} size={34} />
        <span
          className={clsx(
            'absolute -right-0.5 bottom-0 size-3 rounded-full border-2 border-black',
            isOnline ? 'bg-win shadow-[0_0_6px_var(--color-win)]' : 'bg-white/25',
          )}
        />
      </div>

      <div className="flex min-w-0 flex-1 basis-24 flex-col">
        <span className="truncate text-xs font-bold leading-tight">{self.displayName}</span>
        <span
          className={clsx(
            'text-[10px] leading-tight tabular-nums',
            net >= 0 ? 'text-win/80' : 'text-accent/90',
          )}
        >
          {d.table.net} {net >= 0 ? '+' : ''}
          {formatChips(net, locale)}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <ChipStack amount={self.balance} size={13} />
        <span
          className={clsx(
            'text-base font-black leading-none tabular-nums',
            self.balance <= 0 ? 'text-accent' : 'gilt',
          )}
        >
          {formatChips(self.balance, locale)}
        </span>
      </div>

      {contribution > 0 ? (
        <span className="shrink-0 text-[10px] font-medium leading-tight text-muted">
          {d.table.myBet}{' '}
          <span className="text-xs font-black tabular-nums text-text">
            {formatChips(contribution, locale)}
          </span>
        </span>
      ) : null}

      {pending ? (
        <span className="shrink-0 rounded-md bg-warn/15 px-2 py-0.5 text-[11px] font-black leading-tight text-warn ring-1 ring-warn/40 motion-safe:animate-pulse">
          {labels[pending.action]}
          {pending.amount > 0 ? ` ${formatChips(pending.amount, locale)}` : ''}
          {` · ${d.table.waiting}`}
        </span>
      ) : last ? (
        <span
          className={clsx(
            'shrink-0 rounded-md px-2 py-0.5 text-[11px] font-black leading-tight',
            ACTION_BADGE[last.action],
          )}
        >
          {labels[last.action]}
          {last.amount > 0 ? ` ${formatChips(last.amount, locale)}` : ''}
        </span>
      ) : snapshot.currentRound && self.role !== 'observer' ? (
        <Badge tone="muted">{d.table.waiting}</Badge>
      ) : null}
    </div>
  )
}
