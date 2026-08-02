import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { findRoomByCode, getMemberRole } from '@/features/game/queries'
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
import {
  ButtonLink,
  FixedBody,
  FixedPage,
  PageHeader,
  PaneGroup,
  Panel,
  type Pane,
} from '@/components/ui'
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
  const userId = session.user.id

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

  // 이 화면은 참가자 전원의 손익·정산 이체표를 그린다. 방 코드는 31글자 6자리라 훑을 수 있고
  // 이 경로에는 rate limit이 없어서, 열어 두면 남의 방 돈을 읽는 비용이 네트워크 속도뿐이다.
  // `/history`·`/settings`와 같은 규칙으로 막되, 판정은 한 칸 넓다 — `getMemberRole`은
  // `left_at`이 찍힌 사람에게 null을 주는데, 홈의 "지난 세션"과 개인 통계는 나간 방까지
  // 목록에 올리고 그 줄이 이 화면으로 링크된다. 자기가 뛴 세션의 정산표(내가 누구에게 얼마를
  // 줘야 하는지)는 방을 나온 뒤에도 봐야 하므로, 순위표에 이름이 남아 있으면 통과시킨다.
  // 순위표는 이 방의 `room_members` 행에서만 만들어지므로 참가한 적 없는 사람은 걸리지 않는다.
  const role = await getMemberRole(room.id, userId)
  const standings = await getSessionStandings(room.id)
  if (!role && !standings.some((row) => row.userId === userId)) {
    return (
      <main
        id="main"
        className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-6"
      >
        <Panel className="space-y-3 py-8 text-center">
          <p className="text-3xl" aria-hidden>
            🔒
          </p>
          <h1 className="text-xl font-bold">{d.errors.notMember}</h1>
          <div className="pt-2">
            {/* `/history`는 방으로 되돌리지만 여기서는 홈으로 보낸다 — 정산이 끝난 방은
                `/rooms/[code]`가 다시 이 화면으로 리다이렉트해서 오갈 데가 없어진다. */}
            <ButtonLink href="/" variant="primary" className="w-full">
              {d.common.home}
            </ButtonLink>
          </div>
        </Panel>
      </main>
    )
  }

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

  // 참가자가 없으면 순위·정산은 그릴 것이 없다 — 판 기록 하나만 남기고 폭을 다 준다.
  const panes: Pane[] = [
    ...(standings.length > 0
      ? [
          {
            key: 'standings',
            label: d.result.paneStandings,
            node: <RoomStandingsList rows={standingsWithRank} />,
          },
          {
            key: 'settlement',
            label: d.result.paneSettlement,
            node: (
              <SettlementTransferList
                transfers={transferRows}
                imbalancedAmount={netTotal !== 0 ? netTotal : undefined}
              />
            ),
          },
        ]
      : []),
    {
      key: 'rounds',
      label: d.result.paneRounds,
      node: <RoundHistoryList rounds={roundRows} />,
    },
  ]

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
        {/*
          세 목록은 세로로 쌓지 않는다. 예전에는 전부 `flex-1`이라 줄 수와 상관없이 높이를
          똑같이 3등분했고, 그래서 "주고받을 게 없어요" 한 줄짜리 빈 정산 패널이 4명짜리
          순위표와 같은 높이를 먹었다. 순위표 몫은 한 줄도 못 담는 53px까지 눌려
          `overflow-hidden`에 글자가 가로로 잘린 줄이 그대로 보였다(표 81px).
          `PaneGroup`은 홈·관리자 화면과 같은 규약이다 — 데스크톱은 나란히, 모바일은 탭.
          어느 쪽이든 목록 하나가 남은 높이를 통째로 쓰므로 잘릴 일이 없다.
        */}
        <PaneGroup
          ariaLabel={d.result.paneNavAria}
          columns={panes.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-1'}
          panes={panes}
        />
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
