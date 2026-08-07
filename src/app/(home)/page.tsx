import Link from 'next/link'
import type { Route } from 'next'
import { redirect } from 'next/navigation'
import { auth, signOut } from '@/lib/auth'
import { isAdminUser } from '@/features/auth/roles'
import { joinRoomAndGo } from '@/features/game/actions'
import { getMyActiveRooms, getMyRecentSessions } from '@/features/game/queries'
import { HomeLists } from '@/features/game/components/home-lists'
import { HomeNav, homeNavItems } from '@/features/game/components/home-nav'
import {
  Alert,
  Button,
  ButtonLink,
  FixedBody,
  FixedPage,
  Input,
  Panel,
  SubmitButton,
} from '@/components/ui'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { getDict, translateError } from '@/lib/i18n/server'

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { error } = await searchParams
  const [myRooms, recentSessions, isAdmin, { d }] = await Promise.all([
    getMyActiveRooms(session.user.id),
    getMyRecentSessions(session.user.id),
    isAdminUser(session.user.id),
    getDict(),
  ])

  return (
    <FixedPage width="app">
      {/* 좁은 폭에서는 탭 묶음만 `order-last w-full`로 아래 줄에 떨어진다 */}
      <header className="rise-in mb-3 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 lg:mb-4 lg:flex-nowrap">
        <h1 className="font-brush shrink-0 text-3xl font-black tracking-tight lg:text-4xl">
          {d.common.appName}
          <span className="text-accent">.</span>
        </h1>
        <div className="order-last w-full min-w-0 lg:order-none lg:w-auto lg:flex-1">
          <HomeNav items={homeNavItems(d, isAdmin)} label={d.home.navLabel} />
        </div>
        {/*
          글자 링크 둘(소개·로그아웃)을 먼저 붙이고, 유일한 컨트롤인 로케일 알약을 맨 끝에 둔다.
          알약을 글자 사이에 끼우면 그것만 떠 보여서 세로선으로 갈라 놓는다.
        */}
        <div className="ms-auto flex shrink-0 items-center gap-3">
          <Link
            href={'/about' as Route}
            className="whitespace-nowrap text-xs font-semibold text-muted transition hover:text-text"
          >
            {d.home.aboutLink}
          </Link>
          <form
            action={async () => {
              'use server'
              await signOut({ redirectTo: '/login' })
            }}
          >
            <Button type="submit" variant="ghost" size="xs" className="px-0">
              {d.common.logout}
            </Button>
          </form>
          <span aria-hidden className="h-4 w-px bg-white/10" />
          <LocaleSwitcher compact />
        </div>
      </header>
      {error ? (
        <Alert tone="error" className="mb-3 shrink-0">
          <span className="flex items-center justify-between gap-3">
            {translateError(d, error)}
            <Link
              href="/"
              replace
              className="inline-flex min-h-11 shrink-0 items-center px-2 text-xs font-semibold underline underline-offset-4"
            >
              {d.common.close}
            </Link>
          </span>
        </Alert>
      ) : null}

      <FixedBody className="gap-3 lg:grid lg:grid-cols-12 lg:gap-6">
        {/* 넓어진 폭은 입장 폼이 아니라 방 목록이 가져간다 */}
        <div className="shrink-0 space-y-3 lg:col-span-5 lg:space-y-6 xl:col-span-4">
          <Panel className="rise-in rise-in-1 space-y-4">
            <h2 className="text-lg font-bold">{d.home.joinTitle}</h2>
            <form action={joinRoomAndGo} className="flex gap-2">
              <Input
                name="code"
                placeholder={d.home.codePlaceholder}
                maxLength={6}
                autoComplete="off"
                autoCapitalize="characters"
                className="uppercase tracking-[0.35em] placeholder:tracking-normal"
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
          <div className="grid grid-cols-3 gap-2 lg:gap-3">
            {(
              [
                { href: '/advisor' as Route, emoji: '🔮', label: d.home.advisor },
                { href: '/ranking' as Route, emoji: '🏆', label: d.home.ranking },
                { href: '/guide' as Route, emoji: '📖', label: d.home.guide },
              ] as const
            ).map((item) => (
              <Link key={item.href} href={item.href} className="rise-in rise-in-2 block">
                <Panel className="flex h-full flex-col items-center justify-center px-2 py-3 text-center transition-transform hover:-translate-y-0.5 lg:py-5">
                  <p aria-hidden className="text-2xl lg:text-3xl">
                    {item.emoji}
                  </p>
                  <p className="font-brush mt-1 text-sm font-bold lg:mt-2 lg:text-lg">
                    {item.label}
                  </p>
                </Panel>
              </Link>
            ))}
          </div>
        </div>
        <div className="rise-in rise-in-3 flex min-h-0 flex-col lg:col-span-7 xl:col-span-8">
          <HomeLists rooms={myRooms} sessions={recentSessions} />
        </div>
      </FixedBody>
    </FixedPage>
  )
}