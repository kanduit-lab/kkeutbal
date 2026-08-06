'use client'

import { clsx } from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { BetActionView, MemberView, RoomGameType } from '../types'
import { Avatar, Badge } from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'
import { nextActorId as computeNextActorId } from '../turn-order'
import { ACTION_BADGE, betLabelsFor, formatChips, lastAcceptedByUser } from './shared'
import { ChipStack, chipBreakdown } from './game-table-chips'

interface Flight {
  key: number
  fromUserId: string
}

// Seat radius is measured from the felt oval's rim, not the outer container
// box: both this offset and the oval's `inset-[...]` below derive from the
// single --felt-inset constant so they can't drift apart again.
//
// var() fallback이 없으면 좌석 변수 유틸리티가 CSS에 없을 때(개발 중 HMR이 새 클래스를
// 놓친 탭) left/top 전체가 무효가 되고, absolute 요소는 static 위치 — 섹션 좌상단 모서리 —
// 로 떨어져 전 좌석이 한 점에 겹쳐 화면 밖으로 잘린다. 기본값으로 대신 계산되면 간격은
// 어긋나도 배치 자체는 유지된다.
const SEAT_RADIUS_X = `(50cqw - var(--felt-inset, 7) * 1cqw - var(--seat-half-w, 3.5rem))`

function seatX(dx: number): string {
  return `calc(50cqw + ${SEAT_RADIUS_X} * ${dx.toFixed(4)})`
}

function seatY(dy: number): string {
  return `calc(50cqh + (50cqh - var(--felt-inset, 7) * 1cqh - var(--seat-half-h, 3.75rem)) * ${dy.toFixed(4)})`
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
  fit = false,
  participantUserIds,
  carriedPot = 0,
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

  /** 남은 높이에 맞춰 테이블을 줄인다(모바일 포함) — 뷰포트 스크롤을 막기 위한 모드 */
  fit?: boolean

  /** 서버가 확정한 판 참가자 목록. 없으면 관전자를 뺀 좌석 순서로 되돌아간다. */
  participantUserIds?: readonly string[]

  /** 재경기로 무효화된 판에서 다음 판으로 넘어갈 판돈. 판이 없는 동안 팟 자리에 그린다. */
  carriedPot?: number
}) {
  const { d, locale } = useDict()
  const [flights, setFlights] = useState<readonly Flight[]>([])
  const flightKey = useRef(0)
  const lastActionId = useRef<string | null>(null)
  const flightTimers = useRef<ReturnType<typeof setTimeout>[]>([])

  const board = scale === 'board'

  const seatCount = members.length
  const compact = seatCount >= 7
  // 좌석이 2개 이하일 때만 카드를 넓힌다. 폰의 펠트는 납작해서(가로:세로 ≈ 1.8:1) 세로
  // 여유가 거의 없고, 좌우 끝에 마주 놓인 두 좌석 사이는 팟 표시가 차지한다 — 그래서 폭
  // 상한은 팟까지의 거리에서 나온다. 3개가 되면 위쪽 좌석이 양옆 좌석과 세로로 40px 남짓
  // 밖에 안 떨어져서, 조금만 넓혀도 서로 겹친다.
  const roomy = !board && seatCount <= 2
  // 밀집 배치에서만 아바타를 줄여 이름 줄 높이를 아낀다. 크게 키우는 건 전광판(board)뿐이다.
  const avatarSize = board ? 64 : compact ? 30 : 34
  const labels = betLabelsFor(gameType, d)
  const badgeTextClass = board ? 'text-lg' : 'text-[11px] sm:text-xs'

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

  // 턴 순서 계산은 `../turn-order`(순수 함수, 서버 `betting/actions.ts`와 공유)로 뺐다.
  // 판이 돌고 있으면 서버가 확정한 참가자 목록(`RoundView.participantUserIds`)을 그대로 쓴다 —
  // `members`에서 관전자만 걸러 추정하면 판 도중 입장한 사람이 좌석 순환에 끼어 좌석 강조가
  // 서버 판정과 갈라진다. 목록이 없는 화면(판 없음)에서만 관전자 필터로 되돌아간다.
  const seatOrderIds = useMemo(
    () => members.filter((m) => m.role !== 'observer').map((m) => m.userId),
    [members],
  )
  const participantIds = participantUserIds ?? seatOrderIds
  const nextActorId = useMemo(() => {
    if (!roundActive) return null
    return computeNextActorId(participantIds, actions)
  }, [roundActive, participantIds, actions])

  // 정리 타이머는 effect cleanup 이 아니라 언마운트에서만 걷는다. cleanup 에 걸어 두면
  // 700ms 안에 `actions` 가 한 번이라도 바뀌는 순간(팟·잔액 갱신, 20초 폴링, 다른 사람의
  // 액션) React 가 타이머를 취소하는데, 재실행된 effect 는 `latest.id` 가 그대로라 early
  // return 해서 새 타이머를 안 건다 — 날아간 칩이 화면에 영구히 박혀 있었다.
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
    flightTimers.current.push(timer)
  }, [actions])

  useEffect(
    () => () => {
      for (const timer of flightTimers.current) clearTimeout(timer)
      flightTimers.current = []
    },
    [],
  )

  const potChips = chipBreakdown(pot, 7)
  // 판이 없는 동안에는 다음 판으로 넘어갈 이월 판돈을 대신 그린다 — 무효화 시점에 칩이 일단
  // 환불되므로 여기서 0을 보여주면 "판돈이 그냥 사라졌다"로 읽힌다(`docs/04-game-engines.md`).
  const showCarried = !roundActive && carriedPot > 0
  const potText = formatChips(showCarried ? carriedPot : pot, locale)

  return (
    <section
      className={clsx(
        'game-table-felt relative mx-auto mb-4 w-full max-w-3xl select-none overflow-hidden [container-type:size] [--felt-inset:7]',
        compact ? 'aspect-[5/7] sm:aspect-square' : 'aspect-[4/5] sm:aspect-[16/10]',
        fit && 'mb-0 h-full w-auto max-w-full',
        board
          ? '[--seat-half-h:6rem] [--seat-half-w:7rem]'
          : compact
            ? '[--seat-half-h:3.125rem] [--seat-half-w:2.5rem] sm:[--seat-half-h:5rem] sm:[--seat-half-w:5rem]'
            : roomy
              ? // 폭 하한 3.25rem(박스 104px)은 가장 넓은 내용 줄(칩 13 + "1,000" + "+0" +
                // 좌우 패딩 ≈ 103px)이 줄바꿈 없이 들어가는 최소값이고, 15cqw 상한은 박스가
                // 팟 블록(반폭 ≈ 13cqw)을 덮지 않는 한계값이다 — 좌우 끝 좌석의 중심이
                // (93 - 폭)cqw이므로 안쪽 모서리는 93 - 2×폭 = 63cqw = 팟 오른쪽 끝(50 + 13).
                '[--seat-half-h:3rem] [--seat-half-w:clamp(3.25rem,15cqw,6rem)] sm:[--seat-half-h:4rem] sm:[--seat-half-w:clamp(3.5rem,15cqw,7rem)]'
              : 'max-[359px]:[--seat-half-h:3.5rem] max-[359px]:[--seat-half-w:3rem] [--seat-half-h:3.75rem] [--seat-half-w:3.5rem] sm:[--seat-half-h:4.75rem] sm:[--seat-half-w:5.5rem]',
      )}
    >
      {/*
        가로로 돌린 아주 작은 폰(globals.css의 landscape/max-height:500px 블록 참고)에서만
        CSS로 보인다 — 차단 오버레이가 아니라 상단에 붙는 알약형 안내다. 태블릿 가로나
        일반 데스크톱에서는 display:none이 기본값이라 절대 나타나지 않는다.
      */}
      <div className="orientation-hint pointer-events-none absolute inset-x-2 top-2 z-30 items-center justify-center">
        <p className="rounded-full bg-black/70 px-3 py-1 text-center text-[11px] font-medium text-white/90 shadow-[0_2px_8px_rgb(0_0_0/0.4)]">
          {d.room.orientationHint}
        </p>
      </div>
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
            {showCarried ? d.table.potCarriedLabel : d.table.potLabel}
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
                '--fly-x': `calc(${SEAT_RADIUS_X} * ${(-seat.dx * 0.9).toFixed(4)})`,
                '--fly-y': `calc((50cqh - var(--felt-inset, 7) * 1cqh - var(--seat-half-h, 3.75rem)) * ${(-seat.dy * 0.9).toFixed(4)})`,
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
        const avatarEl = (
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
        )
        const seatBody = (
          <div aria-hidden className={clsx('flex flex-col items-center', folded && 'opacity-50')}>
            {!board ? (
              // 이름은 박스 밖, 아바타 옆에 작게 둔다 — 박스 안에 있으면 이름 길이가 박스
              // 폭·높이 예산을 잡아먹는다. 배경이 펠트라 그림자 없이는 안 읽힌다.
              // 이 줄 전체가 박스 위 모서리에 12px(-mb-3) 걸친다 — 박스의 pt-3가 그 몫이다.
              <div className="z-10 -mb-3 flex max-w-[calc(var(--seat-half-w)*2)] items-center justify-center gap-1">
                <div className="shrink-0">{avatarEl}</div>
                <span className="min-w-0 truncate text-[11px] font-bold leading-tight drop-shadow-[0_1px_2px_rgb(0_0_0/0.8)] sm:text-xs">
                  {member.displayName}
                </span>
                {roleLabel ? <Badge tone="accent">{roleLabel}</Badge> : null}
              </div>
            ) : null}
            <div
              className={clsx(
                'seat-card relative flex flex-col items-center rounded-2xl border backdrop-blur-sm transition-all',
                'max-w-[calc(var(--seat-half-w)*2)]',
                board
                  ? 'min-w-36 px-4 pb-2 pt-1.5'
                  : compact
                    ? 'min-w-16 px-1.5 pb-1 pt-3 sm:min-w-20 sm:px-2'
                    : roomy
                      ? // 좌우 여백을 줄여 늘어난 폭이 그대로 내용 자리로 가게 한다. 폭을
                        // 2×half-w로 고정하는 이유: 내용이 좁으면 카드가 max-w보다 작아지는데,
                        // 좌석 중심은 half-w 기준이라 그 차이의 절반만큼 가장자리에서 뜬다 —
                        // 위 15cqw 상한 계산도 폭이 정확히 2×half-w일 때만 성립한다.
                        'w-[calc(var(--seat-half-w)*2)] px-1.5 pb-1 pt-3 sm:px-2'
                      : 'min-w-24 px-2 pb-1 pt-3 max-[359px]:min-w-20 max-[359px]:px-1.5 sm:min-w-32 sm:px-3',
                folded ? 'border-white/5 bg-black/50' : 'border-gold/20 bg-black/60',
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
              {board ? (
                <>
                  {/* 아바타는 카드 위로 걸치게 올린다 — 카드 자체 높이를 그만큼 아낀다. */}
                  <div className="-mt-9 mb-1">{avatarEl}</div>
                  <div className="flex w-full items-center justify-center gap-1">
                    <span className="min-w-0 truncate text-xl font-bold leading-tight sm:text-2xl">
                      {member.displayName}
                    </span>
                    {roleLabel ? <Badge tone="accent">{roleLabel}</Badge> : null}
                  </div>
                </>
              ) : null}
              {/* 잔액과 손익은 한 줄에 둔다 — 좌석 카드는 세로가 아쉽고 가로가 남는다.
                  flex-wrap은 긴 잔액(예: 1,000)과 손익이 같이 안 들어갈 때 손익을 truncate로
                  뭉개는(`+·`) 대신 아랫줄로 내리는 안전장치다. */}
              <div className="mt-0.5 flex max-w-full flex-wrap items-baseline justify-center gap-x-1.5">
                <span className="flex shrink-0 items-center gap-1.5">
                  <ChipStack amount={member.balance} size={board ? 18 : 13} />
                  <span
                    className={clsx(
                      'font-black tabular-nums leading-none',
                      board ? 'text-2xl sm:text-3xl' : 'text-base sm:text-lg',
                      member.balance <= 0 ? 'text-accent' : 'gilt',
                    )}
                  >
                    {formatChips(member.balance, locale)}
                  </span>
                </span>
                {!compact ? (
                  <span
                    className={clsx(
                      'tabular-nums leading-none',
                      board ? 'text-base' : 'text-[11px]',
                      net >= 0 ? 'text-win/80' : 'text-accent/90',
                    )}
                  >
                    {net >= 0 ? '+' : ''}
                    {formatChips(net, locale)}
                  </span>
                ) : null}
              </div>
              {last ? (
                <span
                  className={clsx(
                    'mt-0.5 rounded-md px-2 py-0.5 font-black leading-tight',
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
                    'mt-0.5 rounded-md bg-warn/15 px-2 py-0.5 font-black leading-tight text-warn ring-1 ring-warn/40 motion-safe:animate-pulse',
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
                    'mt-0.5 rounded-md bg-white/10 px-2 py-0.5 font-bold leading-tight text-muted',
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
