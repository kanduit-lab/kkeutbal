'use client'

import { clsx } from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { BetActionKind, BetActionView, MemberView, RoomGameType } from '../types'
import { Avatar, Badge } from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'
import { betLabelsFor, formatChips, lastAcceptedByUser } from './shared'
import { ChipStack, chipBreakdown } from './game-table-chips'

/** 액션별 뱃지 톤 — 무슨 일이 일어났는지 색만으로 구분되게 한다. */
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

/**
 * 게임 테이블 — 좌석을 타원으로 배치하고 중앙에 팟을 쌓는다.
 * 내 좌석은 항상 아래 중앙. 베팅이 확정되면 해당 좌석에서 팟으로 칩이 날아간다.
 * 좌석을 탭하면 onSeatTap 으로 멤버 시트를 연다 (바이인·대리 입력·역할).
 * roundActive 면 차례 힌트(미행동 '대기' 뱃지·다음 액터 골드 링)를 켠다.
 */
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
  /** 판 진행 중 여부 — 차례 힌트는 진행 중에만 의미가 있다. */
  roundActive?: boolean
  /** 'board' = 전광판(모니터) 확대 렌더. 폰 경로('default')는 그대로 둔다. */
  scale?: 'default' | 'board'
  /** 액션 뱃지 표기용 — 섯다는 다이, 포커는 폴드. */
  gameType?: RoomGameType
}) {
  const { d, locale } = useDict()
  const [flights, setFlights] = useState<readonly Flight[]>([])
  const flightKey = useRef(0)
  const lastActionId = useRef<string | null>(null)

  const board = scale === 'board'
  /** 7인 이상은 좌석이 겹친다 — 카드를 줄이고 배치 반경을 번갈아 쓴다. */
  const compact = members.length >= 7
  const avatarSize = board ? 64 : compact ? 36 : 44
  const labels = betLabelsFor(gameType, d)
  const badgeTextClass = board ? 'text-lg' : 'text-xs sm:text-sm'
  /** 좌석 뱃지용 역할 라벨 — 플레이어는 기본값이라 표시하지 않는다. */
  const roleLabels: Record<MemberView['role'], string | null> = {
    host: d.roles.host,
    dealer: d.roles.dealer,
    player: null,
    observer: d.roles.observerShort,
  }

  const seats = useMemo(() => {
    const selfIdx = Math.max(0, members.findIndex((m) => m.userId === selfId))
    const n = members.length
    const dense = n >= 7
    return members.map((member, i) => {
      // 내 좌석 = 아래 중앙(90°). 나머지는 시계 방향 균등 분배.
      const angle = (Math.PI / 2) + ((i - selfIdx) * (Math.PI * 2)) / Math.max(1, n)
      // 7인 이상은 인접 좌석을 두 반지름(38%/44%)에 번갈아 놓아 겹침을 줄인다.
      const rx = dense ? (i % 2 === 0 ? 38 : 44) : 40
      const ry = rx - 1
      return {
        member,
        left: 50 + rx * Math.cos(angle),
        top: 50 + ry * Math.sin(angle),
      }
    })
  }, [members, selfId])

  /** 멤버별 이번 판 마지막 확정 액션. */
  const lastAccepted = useMemo(() => lastAcceptedByUser(actions), [actions])

  /** 멤버별 최신 승인 대기 액션 — seq 오름차순이라 마지막 set 이 최신이다. */
  const pendingByUser = useMemo(() => {
    const map = new Map<string, BetActionView>()
    for (const action of actions) {
      if (action.status === 'pending') map.set(action.userId, action)
    }
    return map
  }, [actions])

  /**
   * 다음 액터 추정 — 최고 seq 확정 액션의 좌석에서 시계 방향으로,
   * 관전자·폴드·올인(더 액션 불가)을 건너뛴 첫 좌석. 스냅샷만으로 계산하는 힌트다.
   */
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
  const potText = formatChips(pot, locale)

  return (
    // container-type: size 는 contain: layout style size 만 건다 — paint 는 포함되지 않아
    // 좌석 카드가 섹션 밖으로 삐져나간다. n=4·8 에서 좌석 중심이 left:90% 에 놓이고 긴
    // 닉네임이 카드를 최대 폭까지 밀면 375px 뷰포트에서 페이지가 통째로 가로 스크롤된다.
    <section className="relative mx-auto mb-4 aspect-[4/5] w-full max-w-3xl select-none overflow-hidden [container-type:size] sm:aspect-[16/10]">
      {/* 펠트 테이블 */}
      <div className="absolute inset-[7%] rounded-[50%] border-8 border-[#5a3a1e] bg-[radial-gradient(ellipse_at_center,#1d6b45_0%,#145233_55%,#0e3d26_100%)] shadow-[inset_0_0_40px_rgb(0_0_0/0.55),0_6px_24px_rgb(0_0_0/0.45)]" />
      <div className="pointer-events-none absolute inset-[12%] rounded-[50%] border border-white/10" />

      {/* 중앙 팟 — 칩 더미와 금액을 한 덩어리로 읽히게 붙여 둔다. */}
      <div className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-end gap-3 text-center">
        {/*
         * 칩은 세로로 겹쳐 쌓는다 — 가로로 늘어놓으면 '줄'로 보이고 판돈이 쌓인 느낌이 안 난다.
         * 아래가 먼저 깔리고 위로 얹히도록 column-reverse 로 그린 뒤, 맨 위(마지막) 칩에만
         * pot-drop 을 걸어 새로 떨어진 칩처럼 보이게 한다.
         */}
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

        {/* 팟은 방에서 가장 자주 바뀌는 값이다 — 라이브 리전으로 읽어 준다.
            숫자 자체는 aria-hidden 으로 두고 문장 하나만 전달해 중복 낭독을 막는다. */}
        <div>
          <p
            aria-hidden
            className={clsx(
              'gilt font-brush font-black leading-none tabular-nums drop-shadow-[0_2px_8px_rgb(0_0_0/0.6)]',
              // 자릿수에 따라 단계로 튀지 않게 컨테이너 폭 기준으로 연속 축소한다
              // (섹션이 container-type:size 라 cqw 를 쓸 수 있다).
              board
                ? 'text-[clamp(3rem,16cqw,6rem)]'
                : 'text-[clamp(2.5rem,14cqw,4.5rem)]',
            )}
          >
            {potText}
          </p>
          {/* text-white/50 은 펠트(#1d6b45) 위에서 2.86:1 — 11px 대문자 자간 확장에는
              한참 못 미친다. /80 으로 올려 4.9:1 을 확보한다. */}
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.3em] text-white/80">
            {d.table.potLabel}
          </p>
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {format(d.room.potAnnounce, { n: potText })}
          </p>
        </div>
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
        const last = lastAccepted.get(member.userId)
        const pending = pendingByUser.get(member.userId)
        const folded = last?.action === 'fold'
        const roleLabel = roleLabels[member.role]
        const net = member.balance - member.buyInTotal
        const isWinner = winnerId === member.userId
        const isNext = roundActive && nextActorId === member.userId
        // 아직 아무 액션도 안 낸 플레이어 — 승인 대기 중이면 이미 행동한 것이므로 제외.
        const waiting =
          roundActive && member.role !== 'observer' && !last && !pending
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
        // 전광판(onSeatTap 없음)에서는 좌석이 아무 동작도 없는 버튼이 되면 안 된다 —
        // TV·태블릿에서 리모컨/키보드 탭이 죽은 컨트롤 N 개를 훑고, 스크린리더도
        // 읽기 전용 화면에서 버튼 N 개를 읽는다. 그때는 이미지 역할의 div 로 낮춘다.
        const interactive = Boolean(onSeatTap)
        const seatPosition = { left: `${left}%`, top: `${top}%` }
        const seatBody = (
            <div
              aria-hidden
              className={clsx(
                'relative flex flex-col items-center rounded-2xl border backdrop-blur-sm transition-all',
                // 폰에서는 카드 최대 폭을 뷰포트 비율로 묶는다 — 고정 max-w-44(176px)는
                // 좌석이 left:90% 에 놓이는 배치에서 화면 밖으로 나간다.
                board
                  ? 'min-w-36 max-w-56 px-4 pb-2.5 pt-2'
                  : compact
                    ? 'min-w-20 max-w-[34vw] px-2 pb-1.5 pt-1 sm:max-w-40'
                    : 'min-w-28 max-w-[38vw] px-3 pb-2 pt-1.5 sm:min-w-32 sm:max-w-44',
                folded ? 'border-white/5 bg-black/50 opacity-50' : 'border-gold/20 bg-black/60',
                isSelf && 'border-gold/60',
                isWinner && 'winner-glow border-win',
                isNext && 'ring-2 ring-gold shadow-[0_0_14px_rgb(229_185_84/0.35)]',
                onSeatTap && 'active:scale-95',
              )}
            >
              {/* 차례 힌트 링 — motion-safe 라 prefers-reduced-motion 에선 정적 링만 남는다. */}
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
