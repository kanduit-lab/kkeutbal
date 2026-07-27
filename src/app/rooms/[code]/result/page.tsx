import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { findRoomByCode } from '@/features/game/queries'
import { normalizeRoomCode } from '@/features/game/room-code'
import { getDict, format } from '@/lib/i18n/server'
import { getRoundHistory, getSessionStandings } from '@/features/ranking/queries'
import { computeSettlementTransfers } from '@/features/ranking/settlement'
import { ShareResultButton } from '@/features/ranking/components/share-result-button'
import { RoomEntryError } from '@/features/game/components/room-entry-error'
import { Badge, ButtonLink, EmptyState, Panel } from '@/components/ui'
import type { Metadata } from 'next'

/**
 * 결과 화면은 링크로 공유되는 유일한 화면이다 — og 태그가 없으면 카카오톡·슬랙이
 * 방 이름 대신 앱 기본 설명만 보여준다. 방을 못 찾으면 기본 메타데이터로 둔다.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>
}): Promise<Metadata> {
  const { code: rawCode } = await params
  const { d } = await getDict()
  const room = await findRoomByCode(normalizeRoomCode(rawCode))
  if (!room) return {}
  const title = format(d.result.shareTitle, { name: room.name })
  return {
    title,
    openGraph: { title, description: d.result.title },
    twitter: { card: 'summary', title, description: d.result.title },
  }
}

export default async function RoomResultPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { code: rawCode } = await params
  // 형제 라우트 5개가 공유하는 한 가지 표면으로 맞춘다 — 아무 설명 없이 홈으로
  // 던지면 사용자는 자기가 뭘 잘못했는지 알 수 없다.
  const code = normalizeRoomCode(rawCode)
  const { d } = await getDict()
  const room = await findRoomByCode(code)
  if (!room) {
    return (
      <RoomEntryError
        title={d.room.notFoundTitle}
        hint={format(d.room.notFoundHint, { code })}
        homeLabel={d.common.home}
      />
    )
  }

  const standings = await getSessionStandings(room.id)
  const rounds = await getRoundHistory(room.id)

  const mvp = standings[0]
  const biggestWin = [...standings].sort((a, b) => b.biggestPot - a.biggestPot)[0]
  const mostFolds = [...standings].sort((a, b) => b.folds - a.folds)[0]
  const mostRaises = [...standings].sort((a, b) => b.raises - a.raises)[0]

  const netTotal = standings.reduce((total, row) => total + row.net, 0)
  const transfers = netTotal === 0 ? computeSettlementTransfers(standings) : []
  const nameById = new Map(standings.map((row) => [row.userId, row.displayName]))
  const displayName = (userId: string) => nameById.get(userId) ?? d.common.unknownPlayer

  return (
    <main id="main" className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-16 pt-8 lg:px-8">
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
          {netTotal !== 0 ? (
            <Panel className="border border-accent/40 bg-accent/10 text-sm text-accent">
              {format(d.result.settlementImbalanced, { n: netTotal.toLocaleString() })}
            </Panel>
          ) : transfers.length === 0 ? (
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
                      .map((penalty) =>
                        format(d.result.penaltyLine, {
                          name: displayName(penalty.userId),
                          factor: penalty.factor,
                        }),
                      )
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
        {/* Link 안에 Button 을 중첩하면 <a><button> 이 되어 탭 스톱이 둘로 늘고
            스크린리더가 "링크, 버튼"으로 읽는다 — ButtonLink 가 그 자리다. */}
        <div className="grid grid-cols-2 gap-2">
          {room.status !== 'settled' && room.status !== 'closed' ? (
            <ButtonLink href={`/rooms/${room.code}`} variant="outline" className="w-full">
              {d.result.toRoom}
            </ButtonLink>
          ) : (
            <ButtonLink href="/ranking" variant="outline" className="w-full">
              {d.home.ranking}
            </ButtonLink>
          )}
          {/* 정산된 방은 되돌아갈 곳이 없다 — 다음 판으로 이어지는 길을 같이 준다.
              여기서 막히면 사용자는 홈으로 나갔다가 방을 다시 만들어야 한다. */}
          <ButtonLink href="/rooms/new" variant="outline" className="w-full">
            {d.newRoom.create}
          </ButtonLink>
          <ButtonLink href="/" variant="primary" className="col-span-2 w-full">
            {d.common.home}
          </ButtonLink>
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
