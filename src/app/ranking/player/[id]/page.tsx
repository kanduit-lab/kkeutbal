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
import { Avatar, Badge, EmptyState, Panel } from '@/components/ui'

/** params 는 외부 입력 — uuid 가 아니면 DB 캐스트 오류 대신 404 로 보낸다. */
const paramsSchema = z.object({ id: z.string().uuid() })

function netClass(net: number): string {
  return net > 0 ? 'text-win' : net < 0 ? 'text-accent' : 'text-muted'
}

function netLabel(net: number): string {
  return `${net > 0 ? '+' : ''}${net.toLocaleString()}`
}

function formatSessionDate(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

function StatTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Panel className="px-2 py-4 text-center">
      <p className="text-xs font-bold text-muted">{label}</p>
      <p className="mt-1 text-xl font-black tabular-nums">{children}</p>
    </Panel>
  )
}

function GameStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="font-bold tabular-nums">{children}</p>
    </div>
  )
}

export default async function PlayerStatsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const parsed = paramsSchema.safeParse(await params)
  if (!parsed.success) notFound()
  const { id } = parsed.data

  const profile = await getPlayerProfile(id)
  if (!profile) notFound()

  const [stats, recentSessions] = await Promise.all([
    getPlayerStats(id),
    getPlayerRecentSessions(id),
  ])

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-16 pt-8 lg:px-8">
      <header className="flex items-center gap-3">
        <Link
          href="/ranking"
          aria-label="랭킹으로 돌아가기"
          className="flex min-h-11 min-w-11 items-center justify-center text-2xl text-muted"
        >
          ←
        </Link>
        <Avatar name={profile.displayName} url={profile.avatarUrl} size={48} />
        <div className="min-w-0">
          <h1 className="truncate font-brush text-4xl font-black lg:text-5xl">
            {profile.displayName}
          </h1>
          <p className="text-xs text-muted">정산이 끝난 세션만 집계합니다</p>
        </div>
      </header>

      <section className="grid grid-cols-3 gap-2" aria-label="전체 요약">
        <StatTile label="세션">{stats.totals.sessions.toLocaleString()}</StatTile>
        <StatTile label="승리">{stats.totals.wins.toLocaleString()}</StatTile>
        <StatTile label="순손익">
          <span className={netClass(stats.totals.net)}>{netLabel(stats.totals.net)}</span>
        </StatTile>
      </section>

      {stats.perGame.length === 0 ? (
        <EmptyState
          title="아직 정산된 세션이 없습니다"
          hint="방을 정산하면 여기에 전적이 쌓입니다"
        />
      ) : (
        <section className="space-y-2">
          <div className="px-1">
            <h2 className="text-sm font-bold text-muted">게임별 전적</h2>
            {/* 판 단위 참가자는 저장하지 않는다 — 판수는 참가한 방에서 끝난 판 전체 기준 */}
            <p className="text-xs text-muted/70">판수는 참가한 방에서 끝난 판 기준</p>
          </div>
          {stats.perGame.map((game) => (
            <Panel key={game.gameType} className="space-y-3 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-xl">{GAME_LABELS[game.gameType].emoji}</span>
                  <p className="truncate font-bold">{GAME_LABELS[game.gameType].name}</p>
                  <Badge tone={GAME_BADGE_TONE[game.gameType]}>{game.sessions}세션</Badge>
                </div>
                <p className={`shrink-0 text-lg font-black tabular-nums ${netClass(game.net)}`}>
                  {netLabel(game.net)}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <GameStat label="판수">{game.rounds.toLocaleString()}</GameStat>
                <GameStat label="승수">{game.wins.toLocaleString()}</GameStat>
                <GameStat label="승률">
                  {game.rounds > 0 ? `${Math.round((game.wins / game.rounds) * 100)}%` : '–'}
                </GameStat>
              </div>
            </Panel>
          ))}
        </section>
      )}

      {/* 최근 세션 — 이력이 없으면 섹션 자체를 그리지 않는다 (홈 화면과 같은 규칙). */}
      {recentSessions.length > 0 ? (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-bold text-muted">최근 세션</h2>
          <div className="grid gap-2">
            {recentSessions.map((past) => (
              <Link key={past.id} href={`/rooms/${past.code}/result`} className="block">
                <Panel className="flex min-h-14 items-center justify-between gap-3 py-3 transition-transform hover:-translate-y-0.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate font-bold">{past.name}</p>
                    <Badge tone={GAME_BADGE_TONE[past.gameType]}>
                      {GAME_LABELS[past.gameType].name}
                    </Badge>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-muted">{formatSessionDate(past.closedAt)}</span>
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
    </main>
  )
}
