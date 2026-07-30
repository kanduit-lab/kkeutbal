import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { findRoomByCode } from '@/features/game/queries'
import { normalizeRoomCode } from '@/features/game/room-code'
import { getDict, format } from '@/lib/i18n/server'
import { getRoundHistory, getSessionStandings } from '@/features/ranking/queries'
import { computeSettlementTransfers } from '@/features/ranking/settlement'
import { ShareResultButton } from '@/features/ranking/components/share-result-button'
import { RoomStandingsList } from '@/features/ranking/components/room-standings-list'
import {
  SettlementTransferList,
  type SettlementTransferRow,
} from '@/features/ranking/components/settlement-transfer-list'
import { RoundHistoryList } from '@/features/ranking/components/round-history-list'
import { RoomEntryError } from '@/features/game/components/room-entry-error'
import { ButtonLink, EmptyState, FixedBody, FixedPage, PageHeader, Panel } from '@/components/ui'
import type { Metadata } from 'next'

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

export default async function RoomResultPage({ params }: { params: Promise<{ code: string }> }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { code: rawCode } = await params

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

  const standingsWithRank = standings.map((row, index) => ({ ...row, rank: index + 1 }))
  const transferRows: SettlementTransferRow[] = transfers.map((transfer) => ({
    fromId: transfer.fromId,
    toId: transfer.toId,
    fromName: displayName(transfer.fromId),
    toName: displayName(transfer.toId),
    amount: transfer.amount,
  }))
  const roundRows = rounds.map((round) => ({
    seq: round.seq,
    winnerName: round.winnerName,
    pot: round.pot,
    note: round.note,
    status: round.status,
    penaltyText:
      round.penalties.length > 0
        ? round.penalties
            .map((penalty) =>
              format(d.result.penaltyLine, {
                name: displayName(penalty.userId),
                factor: penalty.factor,
              }),
            )
            .join(' · ')
        : null,
  }))

  const hasBadges =
    (mvp && mvp.net > 0) ||
    (biggestWin && biggestWin.biggestPot > 0) ||
    (mostRaises && mostRaises.raises > 0) ||
    (mostFolds && mostFolds.folds > 0)

  return (
    <FixedPage width="wide">
      <PageHeader
        className="mb-3 shrink-0"
        title={d.result.title}
        subtitle={`${room.name} · ${d.games[room.gameType]} · ${
          room.status === 'settled' || room.status === 'closed'
            ? d.result.settled
            : d.result.inProgress
        }`}
        backHref="/"
        backLabel={d.common.home}
      />
      <FixedBody className="gap-3">
        {hasBadges ? (
          <section className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
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
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {standings.length === 0 ? (
            <EmptyState title={d.result.noRecords} />
          ) : (
            <>
              <RoomStandingsList rows={standingsWithRank} />
              <SettlementTransferList
                transfers={transferRows}
                imbalancedAmount={netTotal !== 0 ? netTotal : undefined}
              />
            </>
          )}
          <RoundHistoryList rounds={roundRows} />
        </div>
      </FixedBody>
      <div className="shrink-0 space-y-2 pt-3">
        {standings.length > 0 ? (
          <ShareResultButton
            roomName={room.name}
            standings={standings.map((row) => ({ displayName: row.displayName, net: row.net }))}
            transfers={transferRows.map((transfer) => ({
              fromName: transfer.fromName,
              toName: transfer.toName,
              amount: transfer.amount,
            }))}
          />
        ) : null}

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

          <ButtonLink href="/rooms/new" variant="outline" className="w-full">
            {d.newRoom.create}
          </ButtonLink>
          <ButtonLink href="/" variant="primary" className="col-span-2 w-full">
            {d.common.home}
          </ButtonLink>
        </div>
      </div>
    </FixedPage>
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
