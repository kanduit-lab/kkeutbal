'use client'

import { clsx } from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { BetActionKind, BetActionView, MemberView } from '../types'
import { Avatar, Badge } from '@/components/ui'
import { BET_LABELS } from './shared'

const ROLE_LABELS: Record<MemberView['role'], string | null> = {
  host: '방장',
  dealer: '딜러',
  player: null,
  observer: '관전',
}

/** 칩 액면가 → 색. 실물 카지노 칩 관례를 따른다. */
const CHIP_COLORS: readonly { value: number; bg: string; rim: string }[] = [
  { value: 500, bg: '#7c3aed', rim: '#a78bfa' },
  { value: 100, bg: '#18181b', rim: '#52525b' },
  { value: 25, bg: '#15803d', rim: '#4ade80' },
  { value: 5, bg: '#b91c1c', rim: '#f87171' },
  { value: 1, bg: '#e4e4e7', rim: '#a1a1aa' },
]

/** 액션별 뱃지 톤 — 무슨 일이 일어났는지 색만으로 구분되게 한다. */
const ACTION_BADGE: Record<BetActionKind, string> = {
  check: 'bg-white/15 text-text',
  call: 'bg-win/25 text-win',
  raise: 'bg-warn/25 text-warn',
  fold: 'bg-white/10 text-muted',
  allin: 'bg-accent/30 text-accent',
}

function chipBreakdown(amount: number, maxChips = 5): readonly { bg: string; rim: string }[] {
  // 로컬 accumulator — 함수 밖으로 새지 않음
  const chips: { bg: string; rim: string }[] = []
  let rest = Math.max(0, amount)
  for (const denom of CHIP_COLORS) {
    while (rest >= denom.value && chips.length < maxChips) {
      chips.push({ bg: denom.bg, rim: denom.rim })
      rest -= denom.value
    }
    if (chips.length >= maxChips) break
  }
  if (chips.length === 0 && amount > 0) chips.push(CHIP_COLORS[4]!)
  return chips
}

function ChipStack({ amount, size = 16 }: { amount: number; size?: number }) {
  const chips = chipBreakdown(amount)
  if (chips.length === 0) return null
  return (
    <span
      className="relative inline-block shrink-0"
      style={{ width: size, height: size + (chips.length - 1) * (size * 0.28) }}
      aria-hidden
    >
      {chips.map((chip, i) => (
        <span
          key={i}
          className="absolute rounded-full border-2 border-dashed"
          style={{
            width: size,
            height: size,
            left: 0,
            bottom: i * (size * 0.28),
            backgroundColor: chip.bg,
            borderColor: chip.rim,
            boxShadow: '0 1px 1px rgb(0 0 0 / 0.4)',
          }}
        />
      ))}
    </span>
  )
}

interface Flight {
  key: number
  fromUserId: string
}

/**
 * 게임 테이블 — 좌석을 타원으로 배치하고 중앙에 팟을 쌓는다.
 * 내 좌석은 항상 아래 중앙. 베팅이 확정되면 해당 좌석에서 팟으로 칩이 날아간다.
 * 좌석을 탭하면 onSeatTap 으로 멤버 시트를 연다 (바이인·대리 입력·역할).
 */
export function GameTable({
  members,
  online,
  selfId,
  pot,
  actions,
  winnerId,
  onSeatTap,
}: {
  members: readonly MemberView[]
  online: ReadonlySet<string>
  selfId: string
  pot: number
  actions: readonly BetActionView[]
  winnerId: string | null
  onSeatTap?: (member: MemberView) => void
}) {
  const [flights, setFlights] = useState<readonly Flight[]>([])
  const flightKey = useRef(0)
  const lastActionId = useRef<string | null>(null)

  const seats = useMemo(() => {
    const selfIdx = Math.max(0, members.findIndex((m) => m.userId === selfId))
    const n = members.length
    return members.map((member, i) => {
      // 내 좌석 = 아래 중앙(90°). 나머지는 시계 방향 균등 분배.
      const angle = (Math.PI / 2) + ((i - selfIdx) * (Math.PI * 2)) / Math.max(1, n)
      return {
        member,
        left: 50 + 40 * Math.cos(angle),
        top: 50 + 39 * Math.sin(angle),
      }
    })
  }, [members, selfId])

  /** 멤버별 이번 판 마지막 확정 액션. */
  const lastActionByUser = useMemo(() => {
    const map = new Map<string, BetActionView>()
    for (const action of actions) {
      if (action.status === 'accepted') map.set(action.userId, action)
    }
    return map
  }, [actions])

  // 새 확정 베팅(칩 이동) → 그 좌석에서 칩 플라이
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

  return (
    <section className="relative mx-auto mb-4 aspect-[4/5] w-full max-w-3xl select-none [container-type:size] sm:aspect-[16/10]">
      {/* 펠트 테이블 */}
      <div className="absolute inset-[7%] rounded-[50%] border-8 border-[#5a3a1e] bg-[radial-gradient(ellipse_at_center,#1d6b45_0%,#145233_55%,#0e3d26_100%)] shadow-[inset_0_0_40px_rgb(0_0_0/0.55),0_6px_24px_rgb(0_0_0/0.45)]" />
      <div className="pointer-events-none absolute inset-[12%] rounded-[50%] border border-white/10" />

      {/* 중앙 팟 */}
      <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-center">
        <div className="mx-auto mb-1.5 flex h-10 items-end justify-center">
          {potChips.map((chip, i) => (
            <span
              key={i}
              className={clsx(
                'block rounded-full border-2 border-dashed',
                pot > 0 && i === potChips.length - 1 && 'pot-drop',
              )}
              style={{
                width: 24,
                height: 24,
                marginLeft: i === 0 ? 0 : -10,
                backgroundColor: chip.bg,
                borderColor: chip.rim,
                boxShadow: '0 1px 2px rgb(0 0 0 / 0.5)',
              }}
            />
          ))}
        </div>
        <p className="gilt font-brush text-5xl font-black leading-none tabular-nums sm:text-6xl">
          {pot.toLocaleString()}
        </p>
        <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-white/50">pot</p>
      </div>

      {/* 칩 플라이 */}
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
                left: `${seat.left}%`,
                top: `${seat.top}%`,
                '--fly-x': `${(50 - seat.left) * 0.9}cqw`,
                '--fly-y': `${(50 - seat.top) * 0.9}cqh`,
              } as React.CSSProperties
            }
          />
        )
      })}

      {/* 좌석 */}
      {seats.map(({ member, left, top }) => {
        const isSelf = member.userId === selfId
        const isOnline = online.has(member.userId)
        const last = lastActionByUser.get(member.userId)
        const folded = last?.action === 'fold'
        const roleLabel = ROLE_LABELS[member.role]
        const net = member.balance - member.buyInTotal
        const isWinner = winnerId === member.userId
        return (
          <button
            key={member.userId}
            type="button"
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2 text-left"
            style={{ left: `${left}%`, top: `${top}%` }}
            onClick={onSeatTap ? () => onSeatTap(member) : undefined}
            aria-label={`${member.displayName} 좌석`}
          >
            <div
              className={clsx(
                'flex min-w-28 max-w-44 flex-col items-center rounded-2xl border px-3 pb-2 pt-1.5 backdrop-blur-sm transition-all sm:min-w-32',
                folded ? 'border-white/5 bg-black/50 opacity-50' : 'border-gold/20 bg-black/60',
                isSelf && 'border-gold/60',
                isWinner && 'winner-glow border-win',
                onSeatTap && 'active:scale-95',
              )}
            >
              <div className="-mt-6 mb-1">
                <div className="relative">
                  <Avatar name={member.displayName} url={member.avatarUrl} size={44} />
                  <span
                    className={clsx(
                      'absolute -right-0.5 bottom-0 size-3 rounded-full border-2 border-black',
                      isOnline ? 'bg-win shadow-[0_0_6px_var(--color-win)]' : 'bg-white/25',
                    )}
                    title={isOnline ? '접속' : '오프라인'}
                  />
                </div>
              </div>
              <div className="flex w-full items-center justify-center gap-1">
                <span className="min-w-0 truncate text-sm font-bold leading-tight sm:text-base">
                  {member.displayName}
                </span>
                {roleLabel ? <Badge tone="accent">{roleLabel}</Badge> : null}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <ChipStack amount={member.balance} size={15} />
                <span
                  className={clsx(
                    'text-lg font-black tabular-nums leading-none sm:text-xl',
                    member.balance <= 0 ? 'text-accent' : 'gilt',
                  )}
                >
                  {member.balance.toLocaleString()}
                </span>
              </div>
              <span
                className={clsx(
                  'text-xs tabular-nums leading-tight',
                  net >= 0 ? 'text-win/80' : 'text-accent/90',
                )}
              >
                {net >= 0 ? '+' : ''}
                {net.toLocaleString()}
              </span>
              {last ? (
                <span
                  className={clsx(
                    'mt-1 rounded-md px-2 py-0.5 text-xs font-black leading-tight sm:text-sm',
                    ACTION_BADGE[last.action],
                  )}
                >
                  {BET_LABELS[last.action]}
                  {last.amount > 0 ? ` ${last.amount.toLocaleString()}` : ''}
                </span>
              ) : null}
              {isWinner ? <span className="mt-0.5 text-base">🏆</span> : null}
            </div>
          </button>
        )
      })}
    </section>
  )
}
