'use client'

import { clsx } from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { BetActionKind, BetActionView, MemberView, RoomGameType } from '../types'
import { Avatar, Badge } from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'
import { betLabelsFor, formatChips, lastAcceptedByUser } from './shared'
import { ChipStack, chipBreakdown } from './game-table-chips'

const ACTION_BADGE: Record<BetActionKind, string> = {
  check: 'bg-white/15 text-text',
  call: 'bg-win/25 text-win',
  raise: 'bg-warn/25 text-warn',
  fold: 'bg-white/10 text-muted',
  allin: 'bg-accent/30 text-accent',
}

interface Flight {
  key: number
  fromUserId: string
}

// Seat radius is measured from the felt oval's rim, not the outer container
// box: both this offset and the oval's `inset-[...]` below derive from the
// single --felt-inset constant so they can't drift apart again.
function seatX(dx: number): string {
  return `calc(50cqw + (50cqw - var(--felt-inset) * 1cqw - var(--seat-half-w)) * ${dx.toFixed(4)})`
}

function seatY(dy: number): string {
  return `calc(50cqh + (50cqh - var(--felt-inset) * 1cqh - var(--seat-half-h)) * ${dy.toFixed(4)})`
}

export function GameTable({
  members,
  online,
  selfId,
  pot,
  actions,
  winnerId,
  onSeatTap,
  roundActive = false,
  scale = 'default',
  gameType = 'seotda',
}: {
  members: readonly MemberView[]
  online: ReadonlySet<string>
  selfId: string
  pot: number
  actions: readonly BetActionView[]
  winnerId: string | null
  onSeatTap?: (member: MemberView) => void

  roundActive?: boolean

  scale?: 'default' | 'board'

  gameType?: RoomGameType
}) {
  const { d, locale } = useDict()
  const [flights, setFlights] = useState<readonly Flight[]>([])
  const flightKey = useRef(0)
  const lastActionId = useRef<string | null>(null)

  const board = scale === 'board'

  const compact = members.length >= 7
  const avatarSize = board ? 64 : compact ? 36 : 44
  const labels = betLabelsFor(gameType, d)
  const badgeTextClass = board ? 'text-lg' : 'text-xs sm:text-sm'

  const roleLabels: Record<MemberView['role'], string | null> = {
    host: d.roles.host,
    dealer: d.roles.dealer,
    player: null,
    observer: d.roles.observerShort,
  }

  const seats = useMemo(() => {
    const selfIdx = Math.max(
      0,
      members.findIndex((m) => m.userId === selfId),
    )
    const n = members.length
    const dense = n >= 7
    return members.map((member, i) => {
      const angle = Math.PI / 2 + ((i - selfIdx) * (Math.PI * 2)) / Math.max(1, n)

      const radius = dense && i % 2 === 0 ? 0.94 : 1
      return { member, dx: radius * Math.cos(angle), dy: radius * Math.sin(angle) }
    })
  }, [members, selfId])

  const lastAccepted = useMemo(() => lastAcceptedByUser(actions), [actions])

  const pendingByUser = useMemo(() => {
    const map = new Map<string, BetActionView>()
    for (const action of actions) {
      if (action.status === 'pending') map.set(action.userId, action)
    }
    return map
  }, [actions])

  const nextActorId = useMemo(() => {
    if (!roundActive) return null
    let anchor: BetActionView | null = null
    for (const action of actions) {
      if (action.status === 'accepted' && (anchor === null || action.seq > anchor.seq)) {
        anchor = action
      }
    }
    if (!anchor) return null
    const anchorAction = anchor
    const anchorIdx = members.findIndex((m) => m.userId === anchorAction.userId)
    if (anchorIdx < 0) return null
    const n = members.length
    for (let offset = 1; offset < n; offset += 1) {
      const candidate = members[(anchorIdx + offset) % n]!
      if (candidate.role === 'observer') continue
      const candidateLast = lastAccepted.get(candidate.userId)
      if (candidateLast?.action === 'fold' || candidateLast?.action === 'allin') continue
      return candidate.userId
    }
    return null
  }, [roundActive, actions, members, lastAccepted])

  useEffect(() => {
    const accepted = actions.filter((a) => a.status === 'accepted')
    const latest = accepted[accepted.length - 1]
    if (!latest || latest.id === lastActionId.current) return
    lastActionId.current = latest.id
    if (latest.amount <= 0) return
    flightKey.current += 1
    const flight = { key: flightKey.current, fromUserId: latest.userId }
    setFlights((current) => [...current, flight])
    const timer = setTimeout(() => {
      setFlights((current) => current.filter((f) => f.key !== flight.key))
    }, 700)
    return () => clearTimeout(timer)
  }, [actions])

  const potChips = chipBreakdown(pot, 7)
  const potText = formatChips(pot, locale)

  return (
    <section
      className={clsx(
        'relative mx-auto mb-4 w-full max-w-3xl select-none overflow-hidden [container-type:size] [--felt-inset:7]',
        compact ? 'aspect-[5/7] sm:aspect-square' : 'aspect-[4/5] sm:aspect-[16/10]',
        board
          ? '[--seat-half-h:6.5rem] [--seat-half-w:7rem]'
          : compact
            ? '[--seat-half-h:3.125rem] [--seat-half-w:2.5rem] sm:[--seat-half-h:5rem] sm:[--seat-half-w:5rem]'
            : 'max-[359px]:[--seat-half-h:4rem] max-[359px]:[--seat-half-w:3rem] [--seat-half-h:4.25rem] [--seat-half-w:3.5rem] sm:[--seat-half-h:5.5rem] sm:[--seat-half-w:5.5rem]',
      )}
    >
      <div className="absolute inset-[calc(var(--felt-inset)*1%)] rounded-[50%] border-8 border-[#5a3a1e] bg-[radial-gradient(ellipse_at_center,#1d6b45_0%,#145233_55%,#0e3d26_100%)] shadow-[inset_0_0_40px_rgb(0_0_0/0.55),0_6px_24px_rgb(0_0_0/0.45)]" />
      <div className="pointer-events-none absolute inset-[12%] rounded-[50%] border border-white/10" />
      <div className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-end gap-3 text-center">
        {potChips.length > 0 ? (
          <div className="flex flex-col-reverse items-center">
            {potChips.map((chip, i) => (
              <span
                key={i}
                className={clsx(
                  'block shrink-0 rounded-full border-2 border-dashed',
                  pot > 0 && i === potChips.length - 1 && 'pot-drop',
                )}
                style={{
                  width: 30,
                  height: 30,
                  marginBottom: i === 0 ? 0 : -20,
                  backgroundColor: chip.bg,
                  borderColor: chip.rim,
                  boxShadow: '0 2px 3px rgb(0 0 0 / 0.55)',
                }}
              />
            ))}
          </div>
        ) : null}

        <div>
          <p
            aria-hidden
            className={clsx(
              'gilt font-brush font-black leading-none tabular-nums drop-shadow-[0_2px_8px_rgb(0_0_0/0.6)]',
              board ? 'text-[clamp(3rem,16cqw,6rem)]' : 'text-[clamp(2.5rem,14cqw,4.5rem)]',
            )}
          >
            {potText}
          </p>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.3em] text-white/80">
            {d.table.potLabel}
          </p>
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {format(d.room.potAnnounce, { n: potText })}
          </p>
        </div>
      </div>
      {flights.map((flight) => {
        const seat = seats.find((s) => s.member.userId === flight.fromUserId)
        if (!seat) return null
        return (
          <span
            key={flight.key}
            className="chip-fly absolute z-20 block rounded-full border-2 border-dashed border-[#f87171] bg-[#b91c1c]"
            style={
              {
                width: 20,
                height: 20,
                left: seatX(seat.dx),
                top: seatY(seat.dy),
                '--fly-x': `calc((50cqw - var(--felt-inset) * 1cqw - var(--seat-half-w)) * ${(-seat.dx * 0.9).toFixed(4)})`,
                '--fly-y': `calc((50cqh - var(--felt-inset) * 1cqh - var(--seat-half-h)) * ${(-seat.dy * 0.9).toFixed(4)})`,
              } as React.CSSProperties
            }
          />
        )
      })}
      {seats.map(({ member, dx, dy }) => {
        const isSelf = member.userId === selfId
        const isOnline = online.has(member.userId)
        const last = lastAccepted.get(member.userId)
        const pending = pendingByUser.get(member.userId)
        const folded = last?.action === 'fold'
        const roleLabel = roleLabels[member.role]
        const net = member.balance - member.buyInTotal
        const isWinner = winnerId === member.userId
        const isNext = roundActive && nextActorId === member.userId

        const waiting = roundActive && member.role !== 'observer' && !last && !pending
        const seatLabel = [
          member.displayName,
          roleLabel ?? d.roles.player,
          format(d.table.balanceAria, { n: formatChips(member.balance, locale) }),
          isOnline ? d.common.online : d.common.offline,
          folded ? labels.fold : null,
          isWinner ? d.table.winner : null,
        ]
          .filter(Boolean)
          .join(' · ')

        const interactive = Boolean(onSeatTap)
        const seatPosition = { left: seatX(dx), top: seatY(dy) }
        const seatBody = (
          <div
            aria-hidden
            className={clsx(
              'relative flex flex-col items-center rounded-2xl border backdrop-blur-sm transition-all',
              'max-w-[calc(var(--seat-half-w)*2)]',
              board
                ? 'min-w-36 px-4 pb-2.5 pt-2'
                : compact
                  ? 'min-w-16 px-1.5 pb-1.5 pt-1 sm:min-w-20 sm:px-2'
                  : 'min-w-24 px-2.5 pb-2 pt-1.5 max-[359px]:min-w-20 max-[359px]:px-2 sm:min-w-32 sm:px-3',
              folded ? 'border-white/5 bg-black/50 opacity-50' : 'border-gold/20 bg-black/60',
              isSelf && 'border-gold/60',
              isWinner && 'winner-glow border-win',
              isNext && 'ring-2 ring-gold shadow-[0_0_14px_rgb(229_185_84/0.35)]',
              onSeatTap && 'active:scale-95',
            )}
          >
            {waiting && !isNext ? (
              <span className="pointer-events-none absolute -inset-1 rounded-[1.25rem] ring-2 ring-white/15 motion-safe:animate-pulse" />
            ) : null}
            {isNext ? (
              <span className="pointer-events-none absolute -inset-1.5 rounded-[1.35rem] ring-2 ring-gold/60 motion-safe:animate-pulse" />
            ) : null}
            <div className={clsx('mb-1', board ? '-mt-8' : compact ? '-mt-5' : '-mt-6')}>
              <div className="relative">
                <Avatar name={member.displayName} url={member.avatarUrl} size={avatarSize} />
                <span
                  className={clsx(
                    'absolute -right-0.5 bottom-0 rounded-full border-2 border-black',
                    board ? 'size-4' : 'size-3',
                    isOnline ? 'bg-win shadow-[0_0_6px_var(--color-win)]' : 'bg-white/25',
                  )}
                  title={isOnline ? d.common.online : d.common.offline}
                />
              </div>
            </div>
            <div className="flex w-full items-center justify-center gap-1">
              <span
                className={clsx(
                  'min-w-0 truncate font-bold leading-tight',
                  board ? 'text-xl sm:text-2xl' : 'text-sm sm:text-base',
                )}
              >
                {member.displayName}
              </span>
              {roleLabel ? <Badge tone="accent">{roleLabel}</Badge> : null}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <ChipStack amount={member.balance} size={board ? 18 : 15} />
              <span
                className={clsx(
                  'font-black tabular-nums leading-none',
                  board ? 'text-2xl sm:text-3xl' : 'text-lg sm:text-xl',
                  member.balance <= 0 ? 'text-accent' : 'gilt',
                )}
              >
                {formatChips(member.balance, locale)}
              </span>
            </div>
            {!compact ? (
              <span
                className={clsx(
                  'tabular-nums leading-tight',
                  board ? 'text-base' : 'text-xs',
                  net >= 0 ? 'text-win/80' : 'text-accent/90',
                )}
              >
                {net >= 0 ? '+' : ''}
                {formatChips(net, locale)}
              </span>
            ) : null}
            {last ? (
              <span
                className={clsx(
                  'mt-1 rounded-md px-2 py-0.5 font-black leading-tight',
                  badgeTextClass,
                  ACTION_BADGE[last.action],
                )}
              >
                {labels[last.action]}
                {last.amount > 0 ? ` ${formatChips(last.amount, locale)}` : ''}
              </span>
            ) : null}
            {pending ? (
              <span
                className={clsx(
                  'mt-1 rounded-md bg-warn/15 px-2 py-0.5 font-black leading-tight text-warn ring-1 ring-warn/40 motion-safe:animate-pulse',
                  badgeTextClass,
                )}
              >
                {labels[pending.action]}
                {pending.amount > 0 ? ` ${formatChips(pending.amount, locale)}` : ''}
                {` · ${d.table.waiting}`}
              </span>
            ) : null}
            {waiting ? (
              <span
                className={clsx(
                  'mt-1 rounded-md bg-white/10 px-2 py-0.5 font-bold leading-tight text-muted',
                  badgeTextClass,
                )}
              >
                {d.table.waiting}
              </span>
            ) : null}
            {isWinner ? (
              <span className={clsx('mt-0.5', board ? 'text-2xl' : 'text-base')}>🏆</span>
            ) : null}
          </div>
        )
        return interactive ? (
          <button
            key={member.userId}
            type="button"
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2 text-left"
            style={seatPosition}
            onClick={() => onSeatTap?.(member)}
            aria-label={seatLabel}
          >
            {seatBody}
          </button>
        ) : (
          <div
            key={member.userId}
            role="img"
            aria-label={seatLabel}
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2 text-left"
            style={seatPosition}
          >
            {seatBody}
          </div>
        )
      })}
    </section>
  )
}