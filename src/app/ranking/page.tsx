import type { Route } from 'next'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { getCumulativeRanking } from '@/features/ranking/queries'
import { RankingBoard } from '@/features/ranking/components/ranking-board'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { EmptyState, FixedBody, FixedPage, PageHeader, SegmentedLinks } from '@/components/ui'
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
  const visible = ranking.slice(0, TOP_LIMIT).map((row, index) => ({ ...row, rank: index + 1 }))
  const myIndex = ranking.findIndex((row) => row.userId === myId)
  const below = myIndex >= TOP_LIMIT ? ranking[myIndex] : undefined
  const myRowBelowCut = below ? { ...below, rank: myIndex + 1 } : undefined

  return (
    <FixedPage width="content">
      <PageHeader
        className="mb-3 shrink-0"
        title={d.home.ranking}
        subtitle={d.ranking.subtitle}
        backHref="/"
        backLabel={d.common.home}
        actions={<LocaleSwitcher />}
      />
      <div className="mb-3 flex shrink-0 flex-wrap gap-2">
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
        <FixedBody className="gap-2">
          <RankingBoard rows={visible} myId={myId} myRowBelowCut={myRowBelowCut} />
          {ranking.length > TOP_LIMIT ? (
            <p className="shrink-0 text-center text-xs text-muted">
              {format(d.ranking.topNNote, { n: TOP_LIMIT })}
            </p>
          ) : null}
        </FixedBody>
      )}
    </FixedPage>
  )
}