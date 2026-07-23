import Link from 'next/link'
import type { Route } from 'next'
import { redirect } from 'next/navigation'
import { auth, signOut } from '@/lib/auth'
import { isAdminUser } from '@/features/auth/roles'
import { joinRoomAndGo } from '@/features/game/actions'
import { getMyActiveRooms } from '@/features/game/queries'
import { GAME_BADGE_TONE } from '@/features/game/components/shared'
import { Badge, Button, ButtonLink, EmptyState, Input, Panel } from '@/components/ui'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { getDict } from '@/lib/i18n/server'

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { error } = await searchParams
  const [myRooms, isAdmin, { d }] = await Promise.all([
    getMyActiveRooms(session.user.id),
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
          <p className="mt-2 text-muted">{session.user.name ?? 'Player'}</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin ? (
            <Link
              href={'/admin' as Route}
              className="rounded-lg border border-white/10 px-2.5 py-1.5 text-sm text-muted transition-colors hover:text-text"
            >
              관리자
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
          {error}
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
              <Button type="submit" variant="primary" size="lg" className="shrink-0 px-6">
                {d.home.join}
              </Button>
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
                        {room.memberCount}{d.common.people}
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
        </section>
      </div>

      <footer className="mt-12 text-center">
        <Link
          href={'/about' as Route}
          className="text-xs text-muted underline underline-offset-4 hover:text-text"
        >
          끗발 소개
        </Link>
      </footer>
    </main>
  )
}
