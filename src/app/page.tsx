import Link from 'next/link'
import type { Route } from 'next'
import { redirect } from 'next/navigation'
import { auth, signOut } from '@/lib/auth'
import { joinRoomAndGo } from '@/features/game/actions'
import { getMyActiveRooms } from '@/features/game/queries'
import { GAME_BADGE_TONE, GAME_LABELS } from '@/features/game/components/shared'
import { Badge, Button, EmptyState, Input, Panel } from '@/components/ui'

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { error } = await searchParams
  const myRooms = await getMyActiveRooms(session.user.id)

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-16 pt-8 lg:px-8 lg:pt-12">
      <header className="rise-in mb-8 flex items-end justify-between lg:mb-12">
        <div>
          <h1 className="font-brush text-5xl font-black tracking-tight lg:text-6xl">
            끗발<span className="text-accent">.</span>
          </h1>
          <p className="mt-2 text-muted">
            {session.user.name ?? '플레이어'} 님, 오늘도 좋은 패 받으세요
          </p>
        </div>
        <form
          action={async () => {
            'use server'
            await signOut({ redirectTo: '/login' })
          }}
        >
          <Button type="submit" variant="ghost" size="sm">
            로그아웃
          </Button>
        </form>
      </header>

      {error ? (
        <p className="mb-6 rounded-xl border border-accent/30 bg-[#471a17] px-4 py-3 text-sm font-medium text-[#ff9a94]">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-5">
          <Panel className="rise-in rise-in-1 space-y-4">
            <h2 className="text-lg font-bold">판에 끼기</h2>
            <form action={joinRoomAndGo} className="flex gap-2">
              <Input
                name="code"
                placeholder="6자리 코드"
                maxLength={6}
                autoComplete="off"
                autoCapitalize="characters"
                className="uppercase tracking-[0.35em]"
                required
              />
              <Button type="submit" variant="primary" size="lg" className="shrink-0 px-6">
                입장
              </Button>
            </form>
            <Link href="/rooms/new" className="block">
              <Button variant="surface" size="lg" className="w-full">
                + 새 판 벌이기
              </Button>
            </Link>
          </Panel>

          <div className="grid grid-cols-3 gap-3">
            <Link href="/advisor" className="rise-in rise-in-2 block">
              <Panel className="h-full px-2 py-6 text-center transition-transform hover:-translate-y-0.5">
                <p className="text-3xl">🔮</p>
                <p className="font-brush mt-2 text-lg font-bold">족보 도우미</p>
                <p className="mt-1 text-xs text-muted">이 패 뭐지?</p>
              </Panel>
            </Link>
            <Link href="/ranking" className="rise-in rise-in-2 block">
              <Panel className="h-full px-2 py-6 text-center transition-transform hover:-translate-y-0.5">
                <p className="text-3xl">🏆</p>
                <p className="font-brush mt-2 text-lg font-bold">누적 랭킹</p>
                <p className="mt-1 text-xs text-muted">지금까지 전적</p>
              </Panel>
            </Link>
            <Link href={'/guide' as Route} className="rise-in rise-in-2 block">
              <Panel className="h-full px-2 py-6 text-center transition-transform hover:-translate-y-0.5">
                <p className="text-3xl">📖</p>
                <p className="font-brush mt-2 text-lg font-bold">게임 가이드</p>
                <p className="mt-1 text-xs text-muted">규칙·사용법</p>
              </Panel>
            </Link>
          </div>
        </div>

        <section className="rise-in rise-in-3 space-y-3 lg:col-span-7">
          <h2 className="px-1 text-lg font-bold">진행 중인 판</h2>
          {myRooms.length === 0 ? (
            <EmptyState
              title="아직 참여 중인 판이 없어요"
              hint="새로 만들거나 받은 코드로 들어오세요"
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {myRooms.map((room) => (
                <Link key={room.code} href={`/rooms/${room.code}`} className="block">
                  <Panel className="flex h-full items-center justify-between py-4 transition-transform hover:-translate-y-0.5">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{room.name}</p>
                      <p className="mt-0.5 text-sm text-muted">
                        <span className="font-mono tracking-widest">{room.code}</span> ·{' '}
                        {room.memberCount}명
                      </p>
                    </div>
                    <div className="ml-3 flex shrink-0 flex-col items-end gap-1.5">
                      <Badge tone={GAME_BADGE_TONE[room.gameType]}>
                        {GAME_LABELS[room.gameType].name}
                      </Badge>
                      <Badge tone={room.status === 'playing' ? 'win' : 'muted'}>
                        {room.status === 'playing' ? '진행 중' : '대기'}
                      </Badge>
                    </div>
                  </Panel>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
