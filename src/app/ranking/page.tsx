import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getCumulativeRanking } from '@/features/ranking/queries'
import { EmptyState, Panel } from '@/components/ui'

export default async function RankingPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const ranking = await getCumulativeRanking()

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-16 pt-8 lg:px-8">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl text-muted">
          ←
        </Link>
        <div>
          <h1 className="font-brush text-4xl font-black lg:text-5xl">누적 랭킹</h1>
          <p className="text-xs text-muted">정산이 끝난 세션만 집계합니다</p>
        </div>
      </header>

      {ranking.length === 0 ? (
        <EmptyState
          title="아직 정산된 세션이 없습니다"
          hint="방을 정산하면 여기에 누적 전적이 쌓입니다"
        />
      ) : (
        <section className="space-y-2">
          {ranking.map((row, index) => (
            <Panel key={row.userId} className="flex items-center justify-between py-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="w-7 shrink-0 text-center text-lg font-black text-muted">
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-bold">{row.displayName}</p>
                  <p className="text-xs text-muted">
                    {row.sessions}세션 · {row.wins}승
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
          ))}
        </section>
      )}
    </main>
  )
}
