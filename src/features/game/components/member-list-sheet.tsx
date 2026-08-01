'use client'

import { clsx } from 'clsx'
import { Avatar, Badge, EmptyState, Sheet } from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'
import type { BetActionView, MemberView, RoomGameType } from '../types'
import { betLabelsFor, formatChips, lastAcceptedByUser } from './shared'

/**
 * 참가자 목록 시트 — 세로 모바일에서 `MemberSheet`로 가는 유일한 입구.
 *
 * 예전에는 좌석 링의 좌석을 눌러 `MemberSheet`(바이인·대리 베팅·역할 변경·강퇴)를 열었다.
 * 모바일에서 좌석 링을 걷어내면서 그 입구가 사라졌는데, 딜러의 대리 베팅처럼 판 도중에만
 * 쓸 수 있는 기능이 여기 묶여 있어 목록을 따로 낸다. 로비(`LobbyPanel`)에도 같은 입구가
 * 있지만 그건 `status === 'waiting'`일 때뿐이라 판이 도는 동안에는 닿지 않는다.
 */
export function MemberListSheet({
  open,
  onClose,
  members,
  online,
  selfId,
  actions,
  gameType,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  members: readonly MemberView[]
  online: ReadonlySet<string>
  selfId: string
  actions: readonly BetActionView[]
  gameType: RoomGameType
  onSelect: (userId: string) => void
}): React.JSX.Element {
  const { d, locale } = useDict()
  const labels = betLabelsFor(gameType, d)
  const lastAccepted = lastAcceptedByUser(actions)

  const roleLabels: Record<MemberView['role'], string | null> = {
    host: d.roles.host,
    dealer: d.roles.dealer,
    player: null,
    observer: d.roles.observerShort,
  }

  return (
    <Sheet open={open} onClose={onClose} ariaLabel={d.room.membersTitle} className="space-y-3">
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-accent">{d.room.membersTitle}</h2>
        <span className="shrink-0 text-micro tabular-nums text-muted">
          {format(d.lobby.membersCount, { n: members.length })}
        </span>
      </header>

      {members.length === 0 ? (
        <EmptyState title={d.room.membersEmpty} />
      ) : (
        <ul className="space-y-1.5">
          {members.map((member) => {
            const isSelf = member.userId === selfId
            const isOnline = online.has(member.userId)
            const last = lastAccepted.get(member.userId)
            const folded = last?.action === 'fold'
            const roleLabel = roleLabels[member.role]
            const net = member.balance - member.buyInTotal

            return (
              <li key={member.userId}>
                {/*
                  행 전체가 버튼이다 — 폰에서 이름만 좁게 눌러야 하면 오조작이 난다.
                  높이는 Button 계약의 최소 터치 타깃(44px)을 넘기도록 패딩으로 잡는다.
                */}
                <button
                  type="button"
                  onClick={() => onSelect(member.userId)}
                  className={clsx(
                    'flex w-full items-center gap-3 rounded-xl bg-surface px-3 py-2.5 text-left transition active:scale-[0.99]',
                    folded && 'opacity-55',
                  )}
                >
                  <span className="relative shrink-0">
                    <Avatar name={member.displayName} url={member.avatarUrl} size={36} />
                    <span
                      className={clsx(
                        'absolute -right-0.5 bottom-0 size-3 rounded-full border-2 border-black',
                        isOnline ? 'bg-win shadow-[0_0_6px_var(--color-win)]' : 'bg-white/25',
                      )}
                    />
                    <span className="sr-only">{isOnline ? d.common.online : d.common.offline}</span>
                  </span>

                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-bold leading-tight">{member.displayName}</span>
                      {isSelf ? <Badge tone="muted">{d.common.me}</Badge> : null}
                      {roleLabel ? <Badge tone="accent">{roleLabel}</Badge> : null}
                    </span>
                    <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-micro text-muted">
                      <span
                        className={clsx(
                          'tabular-nums',
                          net >= 0 ? 'text-win/80' : 'text-accent/90',
                        )}
                      >
                        {net >= 0 ? '+' : ''}
                        {formatChips(net, locale)}
                      </span>
                      {last ? (
                        <span className="truncate">
                          {labels[last.action]}
                          {last.amount > 0 ? ` ${formatChips(last.amount, locale)}` : ''}
                        </span>
                      ) : null}
                    </span>
                  </span>

                  <span className="gilt shrink-0 text-lg font-black tabular-nums">
                    {formatChips(member.balance, locale)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Sheet>
  )
}
