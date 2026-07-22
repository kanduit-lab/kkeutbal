import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { findRoomByCode } from '@/features/game/queries'
import { normalizeRoomCode } from '@/features/game/room-code'
import { GAME_LABELS } from '@/features/game/components/shared'
import { getRoundHistory, getSessionStandings } from '@/features/ranking/queries'
import { Badge, Button, EmptyState, Panel } from '@/components/ui'

export default async function RoomResultPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { code: rawCode } = await params
  const room = await findRoomByCode(normalizeRoomCode(rawCode))
  if (!room) redirect('/')

  const standings = await getSessionStandings(room.id)
  const rounds = await getRoundHistory(room.id)

  const mvp = standings[0]
  const biggestWin = [...standings].sort((a, b) => b.biggestPot - a.biggestPot)[0]
  const mostFolds = [...standings].sort((a, b) => b.folds - a.folds)[0]
  const mostRaises = [...standings].sort((a, b) => b.raises - a.raises)[0]

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-16 pt-8 lg:px-8">
      <header>
        <p className="text-sm text-muted">
          {room.name} · {GAME_LABELS[room.gameType].name} ·{' '}
          {room.status === 'settled' || room.status === 'closed' ? '정산 완료' : '진행 중'}
        </p>
        <h1 className="font-brush text-4xl font-black lg:text-5xl">세션 결과</h1>
      </header>

      <section className="space-y-2">
        {standings.length === 0 ? (
          <EmptyState title="기록이 없습니다" />
        ) : (
          standings.map((row, index) => (
            <Panel key={row.userId} className="flex items-center justify-between py-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="w-7 shrink-0 text-center text-lg font-black text-muted">
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-bold">{row.displayName}</p>
                  <p className="text-xs text-muted">
                    {row.wins}승 · 바이인 {row.buyInTotal.toLocaleString()} · 잔액{' '}
                    {row.balance.toLocaleString()}
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
          ))
        )}
      </section>

      {standings.length > 0 ? (
        <section className="grid grid-cols-2 gap-2">
          {mvp && mvp.net > 0 ? <BadgeCard emoji="👑" title="MVP" name={mvp.displayName} /> : null}
          {biggestWin && biggestWin.biggestPot > 0 ? (
            <BadgeCard
              emoji="💥"
              title="한방"
              name={`${biggestWin.displayName} (${biggestWin.biggestPot.toLocaleString()})`}
            />
          ) : null}
          {mostRaises && mostRaises.raises > 0 ? (
            <BadgeCard emoji="🚜" title="불도저" name={`${mostRaises.displayName} (레이즈 ${mostRaises.raises})`} />
          ) : null}
          {mostFolds && mostFolds.folds > 0 ? (
            <BadgeCard emoji="🦊" title="여우" name={`${mostFolds.displayName} (다이 ${mostFolds.folds})`} />
          ) : null}
        </section>
      ) : null}

      <section className="space-y-1">
        <h2 className="px-1 text-sm font-bold text-muted">판 기록 ({rounds.length})</h2>
        {rounds.length === 0 ? (
          <EmptyState title="끝난 판이 없습니다" />
        ) : (
          <ul className="space-y-1">
            {rounds.map((round) => (
              <li
                key={round.seq}
                className="flex items-center justify-between rounded-xl bg-surface px-3 py-2 text-sm"
              >
                <span>
                  <span className="text-muted">#{round.seq}</span>{' '}
                  {round.status === 'voided' ? (
                    <span className="text-muted">무효{round.note ? ` — ${round.note}` : ''}</span>
                  ) : (
                    <>
                      <span className="font-medium">{round.winnerName ?? '?'}</span>
                      {round.note ? <span className="text-muted"> · {round.note}</span> : null}
                    </>
                  )}
                </span>
                {round.status === 'ended' ? (
                  <span className="tabular-nums font-bold text-warn">
                    +{round.pot.toLocaleString()}
                  </span>
                ) : (
                  <Badge tone="muted">재경기</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-2 gap-2">
        <Link href={`/rooms/${room.code}`} className="block">
          <Button variant="surface" className="w-full border border-white/10">
            방으로
          </Button>
        </Link>
        <Link href="/" className="block">
          <Button variant="primary" className="w-full">
            홈으로
          </Button>
        </Link>
      </div>
    </main>
  )
}

function BadgeCard({ emoji, title, name }: { emoji: string; title: string; name: string }) {
  return (
    <Panel className="py-3 text-center">
      <p className="text-xl">{emoji}</p>
      <p className="text-xs font-bold text-muted">{title}</p>
      <p className="truncate text-sm font-medium">{name}</p>
    </Panel>
  )
}
