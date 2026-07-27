import Link from 'next/link'
import type { Route } from 'next'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { getCumulativeRanking } from '@/features/ranking/queries'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { Badge, EmptyState, PageHeader, PageShell, Panel, SegmentedLinks } from '@/components/ui'
import { getDict, format } from '@/lib/i18n/server'
import type { Dictionary } from '@/lib/i18n/server'

/** searchParams 는 외부 입력 — 화이트리스트 밖 값은 전부 '전체'로 폴백한다. */
const filterSchema = z.object({
  game: z.enum(['all', 'seotda', 'gostop', 'poker']).catch('all'),
  period: z.enum(['all', '7d', '30d']).catch('all'),
})

type GameFilter = z.infer<typeof filterSchema>['game']
type PeriodFilter = z.infer<typeof filterSchema>['period']

/**
 * 한 화면에 그리는 최대 인원. 누적 랭킹 대상은 정산된 방에 참여한 전체 사용자라
 * 상한이 없으면 사용자 수만큼 Panel 이 늘어난다. 잘려도 내 행은 아래에 따로 붙인다.
 */
const TOP_LIMIT = 50

function gameChips(d: Dictionary): ReadonlyArray<{ value: GameFilter; label: string }> {
  return [
    { value: 'all', label: d.ranking.filterGameAll },
    { value: 'seotda', label: d.games.seotda },
    { value: 'gostop', label: d.games.gostop },
    { value: 'poker', label: d.games.poker },
  ]
}

function periodChips(d: Dictionary): ReadonlyArray<{ value: PeriodFilter; label: string }> {
  return [
    { value: 'all', label: d.ranking.filterPeriodAll },
    { value: '7d', label: d.ranking.filterPeriod7d },
    { value: '30d', label: d.ranking.filterPeriod30d },
  ]
}

const DAY_MS = 24 * 60 * 60 * 1000

function periodToSince(period: PeriodFilter): Date | undefined {
  if (period === '7d') return new Date(Date.now() - 7 * DAY_MS)
  if (period === '30d') return new Date(Date.now() - 30 * DAY_MS)
  return undefined
}

/** 기본값(전체)은 쿼리에서 생략해 /ranking 이 canonical URL 로 남게 한다. */
function filterHref(game: GameFilter, period: PeriodFilter): Route {
  const params = new URLSearchParams()
  if (game !== 'all') params.set('game', game)
  if (period !== 'all') params.set('period', period)
  const query = params.toString()
  return query ? `/ranking?${query}` : '/ranking'
}

function rankMark(index: number): string {
  return index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : String(index + 1)
}

interface RankingRow {
  readonly userId: string
  readonly displayName: string
  readonly sessions: number
  readonly wins: number
  readonly net: number
}

function RankingEntry({
  row,
  index,
  isMe,
  d,
}: {
  row: RankingRow
  index: number
  isMe: boolean
  d: Dictionary
}) {
  return (
    <Link
      // typedRoutes 는 새 동적 라우트를 타입 재생성 전까지 추론하지 못한다
      href={`/ranking/player/${row.userId}` as Route}
      className="block"
    >
      <Panel
        className={`flex min-h-14 items-center justify-between py-3 transition-transform hover:-translate-y-0.5 ${
          isMe ? 'ring-1 ring-gold/40' : ''
        }`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="w-7 shrink-0 text-center text-lg font-black text-muted">
            {rankMark(index)}
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-bold">
              {row.displayName}
              {isMe ? <Badge tone="warn">{d.common.me}</Badge> : null}
            </p>
            <p className="text-xs text-muted">
              {format(d.ranking.sessionsAndWins, { sessions: row.sessions, wins: row.wins })}
            </p>
          </div>
        </div>
        <p
          className={`ml-3 shrink-0 text-xl font-black tabular-nums ${
            row.net > 0 ? 'text-win' : row.net < 0 ? 'text-accent' : 'text-muted'
          }`}
        >
          {row.net > 0 ? '+' : ''}
          {row.net.toLocaleString()}
        </p>
      </Panel>
    </Link>
  )
}

export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string | string[]; period?: string | string[] }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { game, period } = filterSchema.parse(await searchParams)
  const filtered = game !== 'all' || period !== 'all'

  const [ranking, { d }] = await Promise.all([
    getCumulativeRanking({
      gameType: game === 'all' ? undefined : game,
      since: periodToSince(period),
    }),
    getDict(),
  ])

  const myId = session.user.id
  const visible = ranking.slice(0, TOP_LIMIT)
  const myIndex = ranking.findIndex((row) => row.userId === myId)
  const myRowBelowCut = myIndex >= TOP_LIMIT ? ranking[myIndex] : undefined

  return (
    <PageShell width="content" className="space-y-6">
      <PageHeader
        className="mb-0"
        title={d.home.ranking}
        subtitle={d.ranking.subtitle}
        backHref="/"
        backLabel={d.common.home}
        actions={<LocaleSwitcher />}
      />

      <div className="space-y-2">
        <SegmentedLinks
          ariaLabel={d.ranking.filterNavAria}
          size="sm"
          items={gameChips(d).map((chip) => ({
            href: filterHref(chip.value, period),
            label: chip.label,
            active: game === chip.value,
          }))}
        />
        <SegmentedLinks
          ariaLabel={d.ranking.filterPeriodNavAria}
          size="sm"
          items={periodChips(d).map((chip) => ({
            href: filterHref(game, chip.value),
            label: chip.label,
            active: period === chip.value,
          }))}
        />
      </div>

      {ranking.length === 0 ? (
        filtered ? (
          <EmptyState title={d.ranking.emptyFilteredTitle} hint={d.ranking.emptyFilteredHint} />
        ) : (
          <EmptyState title={d.ranking.emptyTitle} hint={d.ranking.emptyHint} />
        )
      ) : (
        <section className="space-y-2" aria-label={d.ranking.listAria}>
          {visible.map((row, index) => (
            <RankingEntry
              key={row.userId}
              row={row}
              index={index}
              isMe={row.userId === myId}
              d={d}
            />
          ))}

          {ranking.length > TOP_LIMIT ? (
            <p className="pt-2 text-center text-xs text-muted">
              {format(d.ranking.topNNote, { n: TOP_LIMIT })}
            </p>
          ) : null}
        </section>
      )}

      {/* 상위 50 밖이면 자기 순위만 따로 붙인다 — 스크롤로 찾게 두지 않는다. */}
      {myRowBelowCut ? (
        <section aria-label={d.ranking.myPositionAria}>
          <RankingEntry row={myRowBelowCut} index={myIndex} isMe d={d} />
        </section>
      ) : null}
    </PageShell>
  )
}
