import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { findRoomByCode, getRoomSnapshot } from '@/features/game/queries'
import { normalizeRoomCode } from '@/features/game/room-code'
import { MonitorClient } from '@/features/game/components/monitor-client'
import { RoomEntryError } from '@/features/game/components/room-entry-error'
import { getDict, format } from '@/lib/i18n/server'

/**
 * 모니터링 화면 — 판 옆 태블릿·TV 용 읽기 전용 전광판.
 * 조작 UI 없이 테이블·팟·기록만 크게 보여준다.
 * 로그인만 하면 참가자가 아니어도 관전할 수 있다 — 자동 입장 없음, 읽기 전용이라
 * 스냅샷(refreshRoom)도 참가 여부를 묻지 않고, 쓰기 액션은 서버에서 각자 막는다.
 */
export default async function MonitorPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { code: rawCode } = await params
  const code = normalizeRoomCode(rawCode)
  // 방 없음·스냅샷 실패는 형제 라우트 5개가 공유하는 한 가지 표면으로 그린다 —
  // 같은 오타가 경로마다 다른 결과(홈 배너 / 무성 리다이렉트 / 404)를 내면 안 된다.
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
