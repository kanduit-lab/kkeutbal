import Link from 'next/link'
import type { Route } from 'next'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import type { ReactNode } from 'react'
import { auth } from '@/lib/auth'
import { getCumulativeRanking } from '@/features/ranking/queries'
import { EmptyState, Panel } from '@/components/ui'
import { getDict, format } from '@/lib/i18n/server'
import type { Dictionary } from '@/lib/i18n/server'

/** searchParams 는 외부 입력 — 화이트리스트 밖 값은 전부 '전체'로 폴백한다. */
const filterSchema = z.object({
  game: z.enum(['all', 'seotda', 'gostop', 'poker']).catch('all'),
  period: z.enum(['all', '7d', '30d']).catch('all'),
})

type GameFilter = z.infer<typeof filterSchema>['game']
type PeriodFilter = z.infer<typeof filterSchema>['period']

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
function filterHref(game: GameFilter, period: PeriodFilter): string {
  const params = new URLSearchParams()
  if (game !== 'all') params.set('game', game)
  if (period !== 'all') params.set('period', period)
  const query = params.toString()
  return query ? `/ranking?${query}` : '/ranking'
}

/** 필터 칩 — 활성은 primary 버튼 룩, 비활성은 surface 룩. 터치 타깃 44px 이상. */
function FilterChip({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: ReactNode
}) {
  return (
    <Link
      // typedRoutes 는 동적으로 조립한 쿼리 문자열을 추론하지 못한다 — 경로 자체는 /ranking 고정
      href={href as Route}
      aria-current={active ? 'true' : undefined}
      className={
        active
          ? 'inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-bold text-white shadow-[0_2px_0_rgb(0_0_0/0.35)]'
          : 'inline-flex min-h-11 items-center rounded-xl border border-gold/15 bg-surface-raised px-4 text-sm font-semibold text-muted transition-colors hover:border-gold/40 hover:text-text'
      }
    >
      {children}
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

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-16 pt-8 lg:px-8">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl text-muted">
          ←
        </Link>
        <div>
          <h1 className="font-brush text-4xl font-black lg:text-5xl">{d.home.ranking}</h1>
          <p className="text-xs text-muted">{d.ranking.subtitle}</p>
        </div>
      </header>

      <nav className="space-y-2" aria-label={d.ranking.filterNavAria}>
        <div className="flex flex-wrap gap-2">
          {gameChips(d).map((chip) => (
            <FilterChip
              key={chip.value}
              href={filterHref(chip.value, period)}
              active={game === chip.value}
            >
              {chip.label}
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {periodChips(d).map((chip) => (
            <FilterChip
              key={chip.value}
              href={filterHref(game, chip.value)}
              active={period === chip.value}
            >
              {chip.label}
            </FilterChip>
          ))}
        </div>
      </nav>

      {ranking.length === 0 ? (
        filtered ? (
          <EmptyState title={d.ranking.emptyFilteredTitle} hint={d.ranking.emptyFilteredHint} />
        ) : (
          <EmptyState title={d.ranking.emptyTitle} hint={d.ranking.emptyHint} />
        )
      ) : (
        <section className="space-y-2">
          {ranking.map((row, index) => (
            <Link
              key={row.userId}
              // typedRoutes 는 새 동적 라우트를 타입 재생성 전까지 추론하지 못한다
              href={`/ranking/player/${row.userId}` as Route}
              className="block"
            >
              <Panel className="flex min-h-14 items-center justify-between py-3 transition-transform hover:-translate-y-0.5">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="w-7 shrink-0 text-center text-lg font-black text-muted">
                    {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-bold">{row.displayName}</p>
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
          ))}
        </section>
      )}
    </main>
  )
}
