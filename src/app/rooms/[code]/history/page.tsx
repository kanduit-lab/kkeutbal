import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { findRoomByCode, getMemberRole } from '@/features/game/queries'
import { getRoomBetHistory } from '@/features/game/bet-history-queries'
import { normalizeRoomCode } from '@/features/game/room-code'
import { BetHistoryClient } from '@/features/game/components/bet-history-client'
import { RoomEntryError } from '@/features/game/components/room-entry-error'
import { getDict, format } from '@/lib/i18n/server'
import { ButtonLink, Panel } from '@/components/ui'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>
}): Promise<Metadata> {
  const { code: rawCode } = await params
  const { d } = await getDict()
  const room = await findRoomByCode(normalizeRoomCode(rawCode))
  if (!room) return {}
  return {
    title: `${d.betHistory.pageTitle} · ${room.name}`,
    // 참가자만 보는 화면이라 색인·미리보기 대상이 아니다. 결과 화면과 달리 공유용이 아니다.
    robots: { index: false, follow: false },
  }
}

export default async function RoomBetHistoryPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
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

  // 방이 끝났을 때야말로 기록을 다시 보는 시점이라 monitor처럼 result로 넘기지 않는다.
  // 대신 이 화면은 모든 참가자의 베팅 패턴을 드러내므로, 데이터를 읽기 전에 참가 여부부터 본다.
  // 나간 사람(`left_at`)은 getMemberRole이 null을 주므로 함께 막힌다.
  const role = await getMemberRole(room.id, session.user.id)
  if (!role) {
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
            <ButtonLink href={`/rooms/${room.code}`} variant="primary" className="w-full">
              {d.betHistory.backToRoom}
            </ButtonLink>
          </div>
        </Panel>
      </main>
    )
  }

  const history = await getRoomBetHistory(room.id)
  if (!history) {
    return (
      <RoomEntryError
        title={d.betHistory.loadFailed}
        hint={d.room.snapshotFailedHint}
        homeLabel={d.common.home}
      />
    )
  }

  return (
    <BetHistoryClient
      code={room.code}
      roomName={room.name}
      gameType={room.gameType}
      rounds={history.rounds}
      truncated={history.truncated}
      cap={history.cap}
    />
  )
}
