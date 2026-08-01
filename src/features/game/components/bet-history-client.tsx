'use client'

import { useMemo } from 'react'
import type { Route } from 'next'
import {
  Badge,
  EmptyState,
  FixedBody,
  FixedPage,
  PageHeader,
  Pager,
  Panel,
  usePagedRows,
} from '@/components/ui'
import { format, translateError, useDict } from '@/lib/i18n/client'
import { betLabelsFor, formatChips } from './shared'
import type { BetHistoryActionView, BetHistoryRoundView } from '../bet-history-queries'
import type { BetStatus, RoomGameType } from '../types'

/** 한 줄 높이(px) — `h-10`(40) + `space-y-1`(4). 판 머리글과 액션 줄이 같은 높이여야 측정이 맞는다 */
const ROW_H = 44

/**
 * 판 머리글과 액션을 한 줄짜리 항목으로 펼친 형태. `usePagedRows`는 줄 높이가 균일하다고
 * 보고 몇 줄이 들어가는지 세기 때문에, 판별로 중첩 목록을 만드는 대신 평평하게 편다.
 */
type HistoryRow =
  | { readonly kind: 'round'; readonly key: string; readonly round: BetHistoryRoundView }
  | { readonly kind: 'action'; readonly key: string; readonly action: BetHistoryActionView }

export function BetHistoryClient({
  code,
  roomName,
  gameType,
  rounds,
  truncated,
  cap,
}: {
  code: string
  roomName: string
  gameType: RoomGameType
  rounds: readonly BetHistoryRoundView[]
  truncated: boolean
  cap: number
}) {
  const { d, locale } = useDict()
  const labels = betLabelsFor(gameType, d)

  const rows = useMemo<readonly HistoryRow[]>(
    () =>
      rounds.flatMap((round): HistoryRow[] => [
        { kind: 'round', key: `round:${round.roundId}`, round },
        ...round.actions.map((action): HistoryRow => ({
          kind: 'action',
          key: `action:${action.id}`,
          action,
        })),
      ]),
    [rounds],
  )
  const paged = usePagedRows({ items: rows, rowHeight: ROW_H })

  const statusBadge: Record<
    BetStatus,
    { label: string; tone: 'muted' | 'warn' | 'accent' } | null
  > = {
    accepted: null,
    pending: { label: d.roundLog.statusPending, tone: 'warn' },
    rejected: { label: d.roundLog.statusRejected, tone: 'accent' },
    reverted: { label: d.roundLog.statusReverted, tone: 'muted' },
  }

  // 잘렸을 때만 "최근 판 · N건"을 덧붙인다. 조용히 자르면 없는 판을 없었던 일로 만든다.
  const subtitle = [
    `${roomName} · ${d.games[gameType]}`,
    truncated ? format(d.betHistory.truncatedNotice, { n: cap }) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  function roundItem(key: string, round: BetHistoryRoundView) {
    const meta = [
      round.pot > 0 ? format(d.betHistory.roundPot, { pot: formatChips(round.pot, locale) }) : null,
      round.winnerId
        ? format(d.betHistory.roundWinner, { name: round.winnerName ?? d.common.unknownPlayer })
        : null,
      format(d.betHistory.actionCount, { n: round.actions.length }),
    ]
      .filter(Boolean)
      .join(' · ')

    return (
      <li key={key} className="flex h-10 items-center gap-2 rounded-xl bg-surface-raised px-3">
        <span className="shrink-0 font-bold text-gold">
          {format(d.betHistory.roundHeading, { seq: round.seq })}
        </span>
        {round.status === 'voided' ? <Badge tone="muted">{d.betHistory.roundVoided}</Badge> : null}
        {round.status === 'playing' ? <Badge tone="warn">{d.betHistory.currentRound}</Badge> : null}
        <span className="min-w-0 truncate text-micro text-muted">{meta}</span>
      </li>
    )
  }

  function actionItem(key: string, action: BetHistoryActionView) {
    const badge = statusBadge[action.status]
    // 사유는 오류 키로 저장돼서 그대로 찍으면 "errors.xxx"가 보인다.
    const reason =
      (action.status === 'rejected' || action.status === 'reverted') && action.reason
        ? format(d.roundLog.reasonLine, { reason: translateError(d, action.reason) })
        : null

    return (
      <li key={key} className="flex h-10 items-center gap-2 rounded-xl bg-surface px-3 text-sm">
        <span className="shrink-0 text-micro tabular-nums text-muted">#{action.seq}</span>
        <span className="shrink-0 font-medium">{action.userName ?? d.common.unknownPlayer}</span>
        <span className="shrink-0 font-bold">{labels[action.action]}</span>
        {action.amount > 0 ? (
          <span className="shrink-0 tabular-nums text-warn">
            {formatChips(action.amount, locale)}
          </span>
        ) : null}
        {action.enteredBy ? (
          <span className="shrink-0 text-micro text-muted">
            ({format(d.roundLog.proxyBy, { name: action.enteredByName ?? d.common.unknownPlayer })})
          </span>
        ) : null}
        {reason ? <span className="min-w-0 truncate text-micro text-muted">{reason}</span> : null}
        {badge ? (
          <span className="ms-auto shrink-0">
            <Badge tone={badge.tone}>{badge.label}</Badge>
          </span>
        ) : null}
      </li>
    )
  }

  return (
    <FixedPage width="wide">
      <PageHeader
        className="mb-3 shrink-0"
        title={d.betHistory.pageTitle}
        subtitle={subtitle}
        backHref={`/rooms/${code}` as Route}
        backLabel={d.common.back}
      />
      <FixedBody>
        {rows.length === 0 ? (
          <Panel className="flex min-h-0 flex-1 flex-col">
            <EmptyState title={d.betHistory.empty} hint={d.betHistory.emptyHint} />
          </Panel>
        ) : (
          <Panel className="flex min-h-0 flex-1 flex-col gap-2">
            <div ref={paged.areaRef} className="min-h-0 flex-1 overflow-hidden">
              <ul className="space-y-1" aria-label={d.betHistory.title}>
                {paged.rows.map((row) =>
                  row.kind === 'round'
                    ? roundItem(row.key, row.round)
                    : actionItem(row.key, row.action),
                )}
              </ul>
            </div>
            <Pager
              page={paged.page}
              pageCount={paged.pageCount}
              from={paged.from}
              to={paged.to}
              total={paged.total}
              onPage={paged.setPage}
            />
          </Panel>
        )}
      </FixedBody>
    </FixedPage>
  )
}
