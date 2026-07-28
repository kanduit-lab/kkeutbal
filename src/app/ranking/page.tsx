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

const filterSchema = z.object({
  game: z.enum(['all', 'seotda', 'gostop', 'poker']).catch('all'),
  period: z.enum(['all', '7d', '30d']).catch('all'),
})

type GameFilter = z.infer<typeof filterSchema>['game']
type PeriodFilter = z.infer<typeof filterSchema>['period']

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
    <Link href={`/ranking/player/${row.userId}` as Route} className="block">
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
      {myRowBelowCut ? (
        <section aria-label={d.ranking.myPositionAria}>
          <RankingEntry row={myRowBelowCut} index={myIndex} isMe d={d} />
        </section>
      ) : null}
    </PageShell>
  )
}