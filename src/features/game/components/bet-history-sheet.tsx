'use client'

import { clsx } from 'clsx'
import { useMemo, useState } from 'react'
import type { Route } from 'next'
import { Avatar, Badge, Button, ButtonLink, EmptyState, Sheet, StatTile } from '@/components/ui'
import { format, translateError, useDict } from '@/lib/i18n/client'
import type { Locale } from '@/lib/i18n/client'
import type { BetActionKind, BetActionView, MemberView, RoomGameType } from '../types'
import { betLabelsFor, formatChips } from './shared'

/**
 * 칩 필터. 액션 종류 그대로 쓰되 '전체'만 별도 값으로 둔다.
 *
 * `allin`도 칩을 준다. 액션 종류의 부분집합만 칩으로 만들면 빠진 종류는 '전체'에서만 보이는데,
 * 하필 올인은 판을 뒤집는 액션이라 되짚을 일이 가장 많다. 칩 6개는 320px에서 두 줄로 접히지만
 * (`flex-wrap`), 안 보이는 것보다 접히는 편이 낫다. 레이즈 필터에 섞지도 않았다 — 콜 올인은
 * 올린 게 아니라 받은 것이라 레이즈로 묶으면 거짓이 된다.
 */
type HistoryFilter = 'all' | BetActionKind

const FILTERS: readonly HistoryFilter[] = ['all', 'raise', 'call', 'check', 'fold', 'allin']

/**
 * 액션 색. 노선도·티커와 같은 약속이다 — 올린 쪽은 accent(주), 받은 쪽은 win(초),
 * 체크는 무채색, 다이는 취소선. 색만으로 구분하지 않고 라벨 텍스트가 항상 함께 있다.
 */
const ACTION_CLASS: Record<BetActionKind, string> = {
  raise: 'text-accent',
  call: 'text-win',
  check: 'text-muted',
  fold: 'text-muted line-through',
  allin: 'text-gold',
}

interface HistoryRow {
  readonly action: BetActionView
  /** 이 액션 직후의 팟. accepted가 아닌 액션은 직전 값을 그대로 물려받는다 */
  readonly potAfter: number
}

/**
 * 액션 시각. 서버가 준 createdAt만 포맷한다 — `new Date()`/`Date.now()`로 "지금"을 읽으면
 * 서버·클라이언트가 다른 값을 그려 하이드레이션이 어긋난다.
 *
 * 초까지 보이되 `13시 59분 47초`(ko 기본 장형) 대신 콜론 형식을 쓴다. 장형은 아바타·액션
 * 열 사이 좁은 메타 줄에서 두 줄로 접히는데, 접히면 행 높이가 들쭉날쭉해져 훑기가 어렵다.
 */
function formatActionTime(locale: Locale, iso: string): string | null {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  return new Intl.DateTimeFormat(locale, { timeStyle: 'medium', hour12: false }).format(at)
}

/**
 * 이번 판 전체 베팅 기록 시트 — 턴 노선도의 📋 버튼이 연다.
 *
 * 노선도는 "직전 하나"만 보여준다. 그것만으로 부족할 때(누가 얼마를 냈는지, 팟이 어디서
 * 뛰었는지 되짚어야 할 때) 여기서 판 전체를 펼친다. 그래서 `RoundLog`(한 줄 요약 목록)와
 * 달리 아바타·시각·행별 누적 팟·하단 합계까지 갖춘 별도 화면으로 짠다.
 */
export function BetHistorySheet({
  open,
  onClose,
  actions,
  members,
  gameType,
  fullHistoryHref,
  selfId,
  roundSeq,
}: {
  open: boolean
  onClose: () => void
  actions: readonly BetActionView[]
  members: readonly MemberView[]
  gameType: RoomGameType

  /** 전체 판 기록 페이지 경로 — 있으면 하단에 링크를 단다 */
  fullHistoryHref?: string

  /** 내 userId — 하단 '내 베팅' 합계와 행의 '나' 뱃지에 쓴다. 없으면 둘 다 생략한다 */
  selfId?: string

  /** 이 액션들이 속한 판 번호. 없으면 판 머리글을 '이번 판'으로 적는다 */
  roundSeq?: number
}): React.JSX.Element | null {
  const { d, locale } = useDict()
  const [filter, setFilter] = useState<HistoryFilter>('all')
  const labels = betLabelsFor(gameType, d)

  const memberOf = useMemo(() => {
    // 행마다 members를 훑으면 O(n*m)이라 한 번만 색인한다. 로컬 accumulator라 밖으로 안 샌다.
    const index = new Map<string, MemberView>()
    for (const member of members) index.set(member.userId, member)
    return index
  }, [members])

  const nameOf = (userId: string) => memberOf.get(userId)?.displayName ?? d.common.unknownPlayer

  /**
   * 행별 누적 팟과 합계. 칩을 실제로 옮긴 건 `accepted`뿐이라 승인 대기·거절·정정 액션은
   * 누적에서 뺀다. 빼지 않으면 거절된 베팅이 팟을 부풀려, 화면 숫자가 정산과 어긋난다.
   */
  const { rows, potTotal, selfBet } = useMemo(() => {
    // seq 오름차순이 누적의 전제다. 서버가 그렇게 주지만 복사본을 정렬해 순서에 기대지 않는다
    // (props 배열은 건드리지 않는다).
    const ordered = [...actions].sort((a, b) => a.seq - b.seq)
    const collected: HistoryRow[] = []
    let running = 0
    let mine = 0
    for (const action of ordered) {
      if (action.status === 'accepted') {
        running += action.amount
        if (selfId && action.userId === selfId) mine += action.amount
      }
      collected.push({ action, potAfter: running })
    }
    return { rows: collected, potTotal: running, selfBet: mine }
  }, [actions, selfId])

  /**
   * 판별로 묶는다. 서버가 이번 판만 넘겨서 실제로는 한 덩어리지만, 묶는 구조를 유지해야
   * 나중에 여러 판이 넘어와도 머리글이 어긋나지 않는다. 최신이 위로 오게 뒤집는다 —
   * 방금 무슨 일이 있었는지가 이 시트를 여는 이유다.
   */
  const groups = useMemo(() => {
    const matched = rows.filter((row) => filter === 'all' || row.action.action === filter)
    const collected: { roundId: string; rows: HistoryRow[] }[] = []
    for (let i = matched.length - 1; i >= 0; i -= 1) {
      const row = matched[i]!
      const last = collected.at(-1)
      if (last && last.roundId === row.action.roundId) last.rows.push(row)
      else collected.push({ roundId: row.action.roundId, rows: [row] })
    }
    return collected
  }, [rows, filter])

  const statusBadge: Record<
    BetActionView['status'],
    { label: string; tone: 'muted' | 'win' | 'warn' | 'accent' } | null
  > = {
    accepted: null,
    pending: { label: d.roundLog.statusPending, tone: 'warn' },
    rejected: { label: d.roundLog.statusRejected, tone: 'accent' },
    reverted: { label: d.roundLog.statusReverted, tone: 'muted' },
  }

  const roundHeading = roundSeq
    ? format(d.betHistory.roundHeading, { seq: roundSeq })
    : d.betHistory.currentRound

  // open이 false여도 조기 반환하지 않는다 — Sheet가 닫힘 애니메이션 동안 계속 그려야 해서
  // 렌더 여부는 Sheet 안의 useModalBehavior가 판단한다.
  return (
    <Sheet open={open} onClose={onClose} ariaLabel={d.roundLog.title} className="space-y-3">
      <div className="mx-auto h-1 w-10 rounded-full bg-white/15 sm:hidden" aria-hidden />

      {/*
        제목은 "이번 판"이라고 범위를 밝힌다 — 시트가 담는 건 현재 판의 액션 전부지 방의 전체
        이력이 아니다. '전체 베팅 기록'이라고 붙였더니 아래 '전체 기록 보기' 링크와 뜻이
        겹쳐서, 링크를 눌러야 나오는 판 전체 이력이 이미 여기 있는 것처럼 읽혔다.
        건수는 목록을 다 훑기 전에 규모를 알려주는 값이라 제목 줄에 같이 둔다.
      */}
      <header className="flex items-center gap-2">
        <h2 className="font-brush text-xl font-bold">{d.betHistory.currentRound}</h2>
        <span className="shrink-0 text-micro tabular-nums text-muted">
          {format(d.betHistory.actionCount, { n: actions.length })}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="-mr-2 ml-auto"
          aria-label={d.common.close}
          onClick={onClose}
        >
          ✕
        </Button>
      </header>

      {/*
        필터는 토글 버튼 묶음이다. 터치 화면이라 hover로 뭘 드러내지 않고, 칩 하나하나가
        44px 높이(size="sm")를 지켜 엄지로 눌린다. 폭은 글자에 맞춰 흘려서 좁은 폰에서
        가로 스크롤 없이 접힌다 — 가로로 밀어야 보이는 칩은 없는 칩이나 마찬가지다.
      */}
      <div role="group" aria-label={d.betHistory.filterAria} className="flex flex-wrap gap-1.5">
        {FILTERS.map((value) => (
          <Button
            key={value}
            size="sm"
            selected={filter === value}
            onClick={() => setFilter(value)}
          >
            {value === 'all' ? d.betHistory.filterAll : labels[value]}
          </Button>
        ))}
      </div>

      {/*
        스크롤은 Sheet(max-h-[88dvh] overflow-y-auto)만 갖는다. 목록이 자기 max-height를 또
        잡으면 시트 안에 스크롤이 겹쳐서 안쪽 목록만 움직이고 하단 합계·링크에 닿지 못한다.
      */}
      {actions.length === 0 ? (
        <EmptyState title={d.betHistory.empty} hint={d.betHistory.emptyHint} />
      ) : groups.length === 0 ? (
        // 필터가 아무것도 못 걸렀을 때. 기록이 없는 것과 다른 상황이라 '전체'로 되돌리는
        // 버튼을 같이 준다 — 사용자가 자기가 건 필터를 못 찾아 헤매지 않게.
        <EmptyState
          title={d.roundLog.empty}
          action={
            <Button size="sm" onClick={() => setFilter('all')}>
              {d.betHistory.filterAll}
            </Button>
          }
        />
      ) : (
        groups.map((group) => (
          <section key={group.roundId}>
            <h3 className="flex items-center gap-2.5 pb-1 pt-2 text-micro font-bold tracking-[0.2em] text-gold/70">
              {roundHeading}
              <span className="h-px flex-1 bg-gold/20" aria-hidden />
            </h3>
            <ul aria-live="polite" aria-relevant="additions">
              {group.rows.map(({ action, potAfter }) => {
                const badge = statusBadge[action.status]
                const isAccepted = action.status === 'accepted'
                const showReason =
                  (action.status === 'rejected' || action.status === 'reverted') &&
                  Boolean(action.reason)
                const time = formatActionTime(locale, action.createdAt)
                const member = memberOf.get(action.userId)
                const name = member?.displayName ?? d.common.unknownPlayer
                return (
                  <li
                    key={action.id}
                    className="flex items-start gap-3 border-b border-white/5 py-2.5 last:border-b-0"
                  >
                    <Avatar name={name} url={member?.avatarUrl} size={32} className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-semibold">
                        <span className="truncate">{name}</span>
                        {selfId && action.userId === selfId ? (
                          <Badge tone="muted">{d.common.me}</Badge>
                        ) : null}
                        {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
                      </p>
                      <p className="truncate text-micro tabular-nums text-muted">
                        {time ? `#${action.seq} · ${time}` : `#${action.seq}`}
                      </p>
                      {action.enteredBy ? (
                        <p className="text-micro text-muted">
                          {format(d.roundLog.proxyBy, { name: nameOf(action.enteredBy) })}
                        </p>
                      ) : null}
                      {showReason ? (
                        <p className="text-micro text-muted">
                          {format(d.roundLog.reasonLine, {
                            reason: translateError(d, action.reason ?? ''),
                          })}
                        </p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      {/*
                        승인되지 않은 액션은 색을 빼고 무채색으로 둔다 — 액션 색은 "칩이 이만큼
                        움직였다"는 신호라서, 거절·대기 중인 줄에까지 칠하면 팟이 이미 커진
                        것처럼 읽힌다.
                      */}
                      <p
                        className={clsx(
                          'text-sm font-bold tabular-nums',
                          isAccepted ? ACTION_CLASS[action.action] : 'text-muted',
                        )}
                      >
                        {labels[action.action]}
                        {action.amount > 0 ? ` ${formatChips(action.amount, locale)}` : ''}
                      </p>
                      {/* 팟 눈금도 같은 이유로 accepted 줄에만 붙인다 */}
                      {isAccepted ? (
                        <p className="text-micro tabular-nums text-muted">
                          {format(d.betHistory.runningPot, { n: formatChips(potAfter, locale) })}
                        </p>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}

      {/*
        합계는 필터와 무관하게 이번 판 전체를 말한다 — 필터는 목록을 좁혀 보는 렌즈일 뿐인데
        합계까지 따라 줄면 "지금 팟이 얼마인가"라는 질문에 틀린 답을 준다.
      */}
      <div className={clsx('grid gap-2 pt-1', selfId ? 'grid-cols-3' : 'grid-cols-2')}>
        <StatTile label={d.table.potLabel} valueClass="gilt text-lg">
          {formatChips(potTotal, locale)}
        </StatTile>
        {selfId ? (
          <StatTile label={d.memberSheet.selfBetTitle} valueClass="gilt text-lg">
            {formatChips(selfBet, locale)}
          </StatTile>
        ) : null}
        <StatTile label={d.betHistory.summaryActions}>{actions.length}</StatTile>
      </div>

      {fullHistoryHref ? (
        <ButtonLink href={fullHistoryHref as Route} variant="outline" className="w-full">
          {d.betHistory.viewAll}
        </ButtonLink>
      ) : null}
      {/*
        머리글의 ✕는 시트와 함께 스크롤돼 목록 아래에서는 화면 밖에 있다. 기록이 길어졌을 때
        닫을 방법이 손 닿는 곳에 남아 있어야 해서 아래에도 하나 둔다.
      */}
      <Button variant="ghost" className="w-full" onClick={onClose}>
        {d.common.close}
      </Button>
    </Sheet>
  )
}
