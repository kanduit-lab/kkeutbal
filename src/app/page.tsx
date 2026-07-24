import Link from 'next/link'
import type { Route } from 'next'
import { redirect } from 'next/navigation'
import { auth, signOut } from '@/lib/auth'
import { isAdminUser } from '@/features/auth/roles'
import { joinRoomAndGo } from '@/features/game/actions'
import { getMyActiveRooms, getMyRecentSessions } from '@/features/game/queries'
import { GAME_BADGE_TONE } from '@/features/game/labels'
import { Badge, Button, ButtonLink, EmptyState, Input, Panel, SubmitButton } from '@/components/ui'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { getDict } from '@/lib/i18n/server'
import type { Dictionary } from '@/lib/i18n/server'
import type { Locale } from '@/lib/i18n/config'

function formatSessionDate(iso: string | null, locale: Locale): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-US', {
    month: 'short',
    day: 'numeric',
  })
}

/**
 * `?error=` 배너 값 해석. joinRoomAndGo 는 실패 시 서버 액션이 돌려준 `errors.*` 키를
 * 그대로 쿼리에 싣는다 — 여기서 사전으로 옮기고, 모르는 키(구버전 링크·예상 밖 값)는
 * 원문을 그대로 보여준다 (translateError 와 동일한 폴백 규칙).
 */
function localizeError(d: Dictionary, raw: string): string {
  if (!raw.startsWith('errors.')) return raw
  const key = raw.slice('errors.'.length) as keyof Dictionary['errors']
  return d.errors[key] ?? raw
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { error } = await searchParams
  const [myRooms, recentSessions, isAdmin, { locale, d }] = await Promise.all([
    getMyActiveRooms(session.user.id),
    getMyRecentSessions(session.user.id),
    isAdminUser(session.user.id),
    getDict(),
  ])

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-16 pt-8 lg:px-8 lg:pt-12">
      <header className="rise-in mb-8 flex items-end justify-between lg:mb-12">
        <div>
          <h1 className="font-brush text-5xl font-black tracking-tight lg:text-6xl">
            {d.common.appName}<span className="text-accent">.</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin ? (
            <Link
              href={'/admin' as Route}
              className="rounded-lg border border-white/10 px-2.5 py-1.5 text-sm text-muted transition-colors hover:text-text"
            >
              {d.common.admin}
            </Link>
          ) : null}
          <LocaleSwitcher />
          <form
            action={async () => {
              'use server'
              await signOut({ redirectTo: '/login' })
            }}
          >
            <Button type="submit" variant="ghost" size="sm">
              {d.common.logout}
            </Button>
          </form>
        </div>
      </header>

      {error ? (
        <p className="mb-6 rounded-xl border border-accent/30 bg-[#471a17] px-4 py-3 text-sm font-medium text-[#ff9a94]">
          {localizeError(d, error)}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-5">
          <Panel className="rise-in rise-in-1 space-y-4">
            <h2 className="text-lg font-bold">{d.home.joinTitle}</h2>
            <form action={joinRoomAndGo} className="flex gap-2">
              <Input
                name="code"
                placeholder={d.home.codePlaceholder}
                maxLength={6}
                autoComplete="off"
                autoCapitalize="characters"
                className="uppercase tracking-[0.35em]"
                required
              />
              <SubmitButton
                variant="primary"
                size="lg"
                className="shrink-0 px-6"
                pendingLabel={d.home.joining}
              >
                {d.home.join}
              </SubmitButton>
            </form>
            <ButtonLink href="/rooms/new" variant="surface" size="lg" className="w-full">
              {d.home.newRoom}
            </ButtonLink>
          </Panel>

          <div className="grid grid-cols-3 gap-3">
            <Link href="/advisor" className="rise-in rise-in-2 block">
              <Panel className="h-full px-2 py-6 text-center transition-transform hover:-translate-y-0.5">
                <p className="text-3xl">🔮</p>
                <p className="font-brush mt-2 text-lg font-bold">{d.home.advisor}</p>
              </Panel>
            </Link>
            <Link href="/ranking" className="rise-in rise-in-2 block">
              <Panel className="h-full px-2 py-6 text-center transition-transform hover:-translate-y-0.5">
                <p className="text-3xl">🏆</p>
                <p className="font-brush mt-2 text-lg font-bold">{d.home.ranking}</p>
              </Panel>
            </Link>
            <Link href={'/guide' as Route} className="rise-in rise-in-2 block">
              <Panel className="h-full px-2 py-6 text-center transition-transform hover:-translate-y-0.5">
                <p className="text-3xl">📖</p>
                <p className="font-brush mt-2 text-lg font-bold">{d.home.guide}</p>
              </Panel>
            </Link>
          </div>
        </div>

        <section className="rise-in rise-in-3 space-y-3 lg:col-span-7">
          <h2 className="px-1 text-lg font-bold">{d.home.activeRooms}</h2>
          {myRooms.length === 0 ? (
            <EmptyState title={d.home.emptyTitle} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {myRooms.map((room) => (
                <Link key={room.code} href={`/rooms/${room.code}`} className="block">
                  <Panel className="flex h-full items-center justify-between py-4 transition-transform hover:-translate-y-0.5">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{room.name}</p>
                      <p className="mt-0.5 text-sm text-muted">
                        <span className="font-mono tracking-widest">{room.code}</span> ·{' '}
                        {d.home.memberCount.replace('{n}', String(room.memberCount))}
                      </p>
                    </div>
                    <div className="ml-3 flex shrink-0 flex-col items-end gap-1.5">
                      <Badge tone={GAME_BADGE_TONE[room.gameType]}>
                        {d.games[room.gameType]}
                      </Badge>
                      <Badge tone={room.status === 'playing' ? 'win' : 'muted'}>
                        {room.status === 'playing' ? d.common.playing : d.common.waiting}
                      </Badge>
                    </div>
                  </Panel>
                </Link>
              ))}
            </div>
          )}

          {/* 지난 세션 — 이력이 없으면 섹션 자체를 그리지 않는다 (빈 상태 안내 불필요). */}
          {recentSessions.length > 0 ? (
            <div className="space-y-3 pt-4">
              <h2 className="px-1 text-lg font-bold">{d.home.recentSessions}</h2>
              <div className="grid gap-2">
                {recentSessions.map((past) => (
                  <Link key={past.id} href={`/rooms/${past.code}/result`} className="block">
                    <Panel className="flex items-center justify-between gap-3 py-3 transition-transform hover:-translate-y-0.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate font-bold">{past.name}</p>
                        <Badge tone={GAME_BADGE_TONE[past.gameType]}>
                          {d.games[past.gameType]}
                        </Badge>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-xs text-muted">
                          {formatSessionDate(past.closedAt, locale)}
                        </span>
                        <span
                          className={`font-black tabular-nums ${
                            past.myNet > 0
                              ? 'text-win'
                              : past.myNet < 0
                                ? 'text-accent'
                                : 'text-muted'
                          }`}
                        >
                          {past.myNet > 0 ? '+' : ''}
                          {past.myNet.toLocaleString()}
                        </span>
                      </div>
                    </Panel>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <footer className="mt-12 text-center">
        <Link
          href={'/about' as Route}
          className="text-xs text-muted underline underline-offset-4 hover:text-text"
        >
          {d.home.aboutLink}
        </Link>
      </footer>
    </main>
  )
}
