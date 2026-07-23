import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { findRoomByCode } from '@/features/game/queries'
import { normalizeRoomCode } from '@/features/game/room-code'
import { getDict, format } from '@/lib/i18n/server'
import { getRoundHistory, getSessionStandings } from '@/features/ranking/queries'
import { computeSettlementTransfers } from '@/features/ranking/settlement'
import { ShareResultButton } from '@/features/ranking/components/share-result-button'
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

  const { d } = await getDict()

  const standings = await getSessionStandings(room.id)
  const rounds = await getRoundHistory(room.id)

  const mvp = standings[0]
  const biggestWin = [...standings].sort((a, b) => b.biggestPot - a.biggestPot)[0]
  const mostFolds = [...standings].sort((a, b) => b.folds - a.folds)[0]
  const mostRaises = [...standings].sort((a, b) => b.raises - a.raises)[0]

  const transfers = computeSettlementTransfers(standings)
  const nameById = new Map(standings.map((row) => [row.userId, row.displayName]))
  const displayName = (userId: string) => nameById.get(userId) ?? d.common.unknownPlayer

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-16 pt-8 lg:px-8">
      <header>
        <p className="text-sm text-muted">
          {room.name} · {d.games[room.gameType]} ·{' '}
          {room.status === 'settled' || room.status === 'closed' ? d.result.settled : d.result.inProgress}
        </p>
        <h1 className="font-brush text-4xl font-black lg:text-5xl">{d.result.title}</h1>
      </header>

      <section className="space-y-2">
        {standings.length === 0 ? (
          <EmptyState title={d.result.noRecords} />
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
                    {format(d.result.statLine, {
                      wins: row.wins,
                      buyIn: row.buyInTotal.toLocaleString(),
                      balance: row.balance.toLocaleString(),
                    })}
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
        <section className="space-y-1">
          <h2 className="px-1 text-sm font-bold text-muted">{d.result.settlementTitle}</h2>
          {transfers.length === 0 ? (
            <EmptyState title={d.result.nothingToSettle} />
          ) : (
            <ul className="space-y-1">
              {transfers.map((transfer) => (
                <li
                  key={`${transfer.fromId}:${transfer.toId}`}
                  className="flex items-center justify-between rounded-xl bg-surface px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{displayName(transfer.fromId)}</span>{' '}
                    <span className="text-muted">→</span>{' '}
                    <span className="font-medium">{displayName(transfer.toId)}</span>
                  </span>
                  <span className="ml-3 shrink-0 tabular-nums font-bold">
                    {transfer.amount.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {standings.length > 0 ? (
        <section className="grid grid-cols-2 gap-2">
          {mvp && mvp.net > 0 ? (
            <BadgeCard emoji="👑" title={d.result.badgeMvp} name={mvp.displayName} />
          ) : null}
          {biggestWin && biggestWin.biggestPot > 0 ? (
            <BadgeCard
              emoji="💥"
              title={d.result.badgeBiggestWin}
              name={`${biggestWin.displayName} (${biggestWin.biggestPot.toLocaleString()})`}
            />
          ) : null}
          {mostRaises && mostRaises.raises > 0 ? (
            <BadgeCard
              emoji="🚜"
              title={d.result.badgeBulldozer}
              name={`${mostRaises.displayName} (${format(d.result.raisesCount, { n: mostRaises.raises })})`}
            />
          ) : null}
          {mostFolds && mostFolds.folds > 0 ? (
            <BadgeCard
              emoji="🦊"
              title={d.result.badgeFox}
              name={`${mostFolds.displayName} (${format(d.result.foldsCount, { n: mostFolds.folds })})`}
            />
          ) : null}
        </section>
      ) : null}

      <section className="space-y-1">
        <h2 className="px-1 text-sm font-bold text-muted">
          {format(d.result.roundHistoryCount, { n: rounds.length })}
        </h2>
        {rounds.length === 0 ? (
          <EmptyState title={d.result.noRecords} />
        ) : (
          <ul className="space-y-1">
            {rounds.map((round) => (
              <li key={round.seq} className="rounded-xl bg-surface px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>
                    <span className="text-muted">#{round.seq}</span>{' '}
                    {round.status === 'voided' ? (
                      <span className="text-muted">
                        {d.result.voided}
                        {round.note ? ` — ${round.note}` : ''}
                      </span>
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
                    <Badge tone="muted">{d.result.rematch}</Badge>
                  )}
                </div>
                {round.status === 'ended' && round.penalties.length > 0 ? (
                  <p className="mt-0.5 text-xs text-muted">
                    {round.penalties
                      .map((penalty) => `${displayName(penalty.userId)} 박×${penalty.factor}`)
                      .join(' · ')}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="space-y-2">
        {standings.length > 0 ? (
          <ShareResultButton
            roomName={room.name}
            standings={standings.map((row) => ({ displayName: row.displayName, net: row.net }))}
            transfers={transfers.map((transfer) => ({
              fromName: displayName(transfer.fromId),
              toName: displayName(transfer.toId),
              amount: transfer.amount,
            }))}
          />
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Link href={`/rooms/${room.code}`} className="block">
            <Button variant="surface" className="w-full border border-white/10">
              {d.result.toRoom}
            </Button>
          </Link>
          <Link href="/" className="block">
            <Button variant="primary" className="w-full">
              {d.common.home}
            </Button>
          </Link>
        </div>
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
