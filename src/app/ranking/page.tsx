import type { Route } from 'next'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { getCumulativeRanking } from '@/features/ranking/queries'
import { RankingBoard } from '@/features/ranking/components/ranking-board'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { EmptyState, FixedBody, FixedPage, PageHeader, SegmentedLinks } from '@/components/ui'
import { getDict } from '@/lib/i18n/server'
import type { Dictionary } from '@/lib/i18n/server'

const filterSchema = z.object({
  game: z.enum(['all', 'seotda', 'gostop']).catch('all'),
  period: z.enum(['all', '7d', '30d']).catch('all'),
})

type GameFilter = z.infer<typeof filterSchema>['game']
type PeriodFilter = z.infer<typeof filterSchema>['period']

function gameChips(d: Dictionary): ReadonlyArray<{ value: GameFilter; label: string }> {
  return [
    { value: 'all', label: d.ranking.filterGameAll },
    { value: 'seotda', label: d.games.seotda },
    { value: 'gostop', label: d.games.gostop },
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
  searchParams: Promise<{
    game?: string | string[]
    period?: string | string[]
  }>
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
  const rows = ranking.map((row, index) => ({ ...row, rank: index + 1 }))

  return (
    <FixedPage width="wide">
      <PageHeader
        className="mb-3 shrink-0"
        title={d.home.ranking}
        subtitle={d.ranking.subtitle}
        backHref="/"
        backLabel={d.common.home}
        actions={<LocaleSwitcher />}
      />
      <section className="lacquer mb-3 shrink-0 space-y-3 rounded-2xl p-3 sm:flex sm:items-end sm:justify-between sm:gap-6 sm:space-y-0 sm:p-4">
        <div className="space-y-1.5">
          <p className="text-micro font-bold text-muted">{d.ranking.gameLabel}</p>
          <SegmentedLinks
            ariaLabel={d.ranking.filterNavAria}
            size="sm"
            items={gameChips(d).map((chip) => ({
              href: filterHref(chip.value, period),
              label: chip.label,
              active: game === chip.value,
            }))}
          />
        </div>
        <div className="space-y-1.5">
          <p className="text-micro font-bold text-muted">{d.ranking.periodLabel}</p>
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
      </section>
      {ranking.length === 0 ? (
        filtered ? (
          <EmptyState title={d.ranking.emptyFilteredTitle} hint={d.ranking.emptyFilteredHint} />
        ) : (
          <EmptyState title={d.ranking.emptyTitle} hint={d.ranking.emptyHint} />
        )
      ) : (
        <FixedBody>
          <RankingBoard rows={rows} myId={myId} />
        </FixedBody>
      )}
    </FixedPage>
  )
}
