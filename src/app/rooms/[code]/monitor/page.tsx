import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { findRoomByCode, getMemberRole, getRoomSnapshot } from '@/features/game/queries'
import { normalizeRoomCode } from '@/features/game/room-code'
import { MonitorClient } from '@/features/game/components/monitor-client'
import { RoomEntryError } from '@/features/game/components/room-entry-error'
import { getDict, format } from '@/lib/i18n/server'
import { ButtonLink, Panel } from '@/components/ui'

export default async function MonitorPage({ params }: { params: Promise<{ code: string }> }) {
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
  if (room.status === 'settled' || room.status === 'closed') {
    redirect(`/rooms/${room.code}/result`)
  }

  // 전광판은 "큰 화면에 띄우는 공용 화면"이지만 그 화면을 여는 사람은 방 안의 사람이다.
  // 스냅샷에는 참가자 전원의 잔액·바이인 총액과 이번 판의 베팅이 그대로 들어 있고,
  // `MonitorClient`가 쓰는 `refreshRoom`은 이미 참가자만 받는다 — 여기만 열어 두면 방 코드를
  // 훑어 남의 방 돈을 한 번 읽어 갈 수 있는데, 정작 그 화면은 갱신도 안 되는 반쪽이다.
  // 나간 사람(`left_at`)은 getMemberRole이 null을 주므로 함께 막힌다. `/history`와 같은 규칙이다.
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
            {/* 방 코드를 아는 사람은 방으로 들어가면 참가자가 된다. 전광판을 열려면 그 길로
                가라는 뜻이다 — 몰래 읽는 대신 참가자 목록에 이름이 남는 경로다. */}
            <ButtonLink href={`/rooms/${room.code}`} variant="primary" className="w-full">
              {d.monitor.backToRoom}
            </ButtonLink>
          </div>
        </Panel>
      </main>
    )
  }

  const snapshot = await getRoomSnapshot(room.id)
  if (!snapshot) {
    return (
      <RoomEntryError
        title={d.room.snapshotFailedTitle}
        hint={d.room.snapshotFailedHint}
        homeLabel={d.common.home}
      />
    )
  }

  return <MonitorClient initial={snapshot} selfId={session.user.id} />
}
