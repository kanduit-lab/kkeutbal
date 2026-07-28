import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import type { ReactNode } from 'react'
import { auth } from '@/lib/auth'
import {
  getPlayerProfile,
  getPlayerRecentSessions,
  getPlayerStats,
} from '@/features/ranking/queries'
import { GAME_BADGE_TONE, GAME_LABELS } from '@/features/game/labels'
import { Avatar, Badge, EmptyState, PageShell, Panel, StatTile } from '@/components/ui'
import { getDict, format } from '@/lib/i18n/server'
import type { Locale } from '@/lib/i18n/config'

const paramsSchema = z.object({ id: z.string().uuid() })

function netClass(net: number): string {
  return net > 0 ? 'text-win' : net < 0 ? 'text-accent' : 'text-muted'
}

function netLabel(net: number): string {
  return `${net > 0 ? '+' : ''}${net.toLocaleString()}`
}

function formatSessionDate(iso: string | null, locale: Locale): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function GameStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="font-bold tabular-nums">{children}</p>
    </div>
  )
}

export default async function PlayerStatsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const parsed = paramsSchema.safeParse(await params)
  if (!parsed.success) notFound()
  const { id } = parsed.data

  const profile = await getPlayerProfile(id)
  if (!profile) notFound()

  const [stats, recentSessions, { locale, d }] = await Promise.all([
    getPlayerStats(id),
    getPlayerRecentSessions(id),
    getDict(),
  ])

  return (
    <PageShell width="content" className="space-y-6">
      <header className="flex items-center gap-2">
        <Link
          href="/ranking"
          aria-label={d.ranking.backAria}
          className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-xl text-muted transition hover:text-text"
        >
          ←
        </Link>
        <Avatar name={profile.displayName} url={profile.avatarUrl} size={44} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-brush text-2xl font-black">{profile.displayName}</h1>
          <p className="mt-0.5 text-sm text-muted">{d.ranking.subtitle}</p>
        </div>
      </header>
      <section className="grid grid-cols-3 gap-2" aria-label={d.ranking.overallSummaryAria}>
        <StatTile tone="panel" label={d.ranking.statSessions} valueClass="text-xl">
          {stats.totals.sessions.toLocaleString()}
        </StatTile>
        <StatTile tone="panel" label={d.ranking.statWins} valueClass="text-xl">
          {stats.totals.wins.toLocaleString()}
        </StatTile>
        <StatTile tone="panel" label={d.ranking.statNet} valueClass="text-xl">
          <span className={netClass(stats.totals.net)}>{netLabel(stats.totals.net)}</span>
        </StatTile>
      </section>
      {stats.perGame.length === 0 ? (
        <EmptyState title={d.ranking.emptyTitle} hint={d.ranking.playerEmptyHint} />
      ) : (
        <section className="space-y-2">
          <div className="px-1">
            <h2 className="text-sm font-bold text-muted">{d.ranking.perGameTitle}</h2>
            <p className="text-xs text-muted/70">{d.ranking.roundsNote}</p>
          </div>
          {stats.perGame.map((game) => (
            <Panel key={game.gameType} className="space-y-3 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className="text-xl">
                    {GAME_LABELS[game.gameType].emoji}
                  </span>
                  <p className="truncate font-bold">{d.games[game.gameType]}</p>
                  <Badge tone={GAME_BADGE_TONE[game.gameType]}>
                    {format(d.ranking.sessionsBadge, { n: game.sessions })}
                  </Badge>
                </div>
                <p className={`shrink-0 text-lg font-black tabular-nums ${netClass(game.net)}`}>
                  {netLabel(game.net)}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <GameStat label={d.ranking.statRounds}>{game.rounds.toLocaleString()}</GameStat>
                <GameStat label={d.ranking.statGameWins}>{game.wins.toLocaleString()}</GameStat>
                <GameStat label={d.ranking.statWinRate}>
                  {game.rounds > 0 ? `${Math.round((game.wins / game.rounds) * 100)}%` : '–'}
                </GameStat>
              </div>
            </Panel>
          ))}
        </section>
      )}
      {recentSessions.length > 0 ? (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-bold text-muted">{d.ranking.recentSessionsTitle}</h2>
          <div className="grid gap-2">
            {recentSessions.map((past) => (
              <Link key={past.id} href={`/rooms/${past.code}/result`} className="block">
                <Panel className="flex min-h-14 items-center justify-between gap-3 py-3 transition-transform hover:-translate-y-0.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate font-bold">{past.name}</p>
                    <Badge tone={GAME_BADGE_TONE[past.gameType]}>{d.games[past.gameType]}</Badge>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-muted">
                      {formatSessionDate(past.closedAt, locale)}
                    </span>
                    <span className={`font-black tabular-nums ${netClass(past.myNet)}`}>
                      {netLabel(past.myNet)}
                    </span>
                  </div>
                </Panel>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </PageShell>
  )
}