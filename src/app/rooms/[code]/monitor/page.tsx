import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { findRoomByCode, getRoomSnapshot } from '@/features/game/queries'
import { normalizeRoomCode } from '@/features/game/room-code'
import { MonitorClient } from '@/features/game/components/monitor-client'

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
  const room = await findRoomByCode(code)
  if (!room) redirect('/')
  if (room.status === 'settled' || room.status === 'closed') {
    redirect(`/rooms/${room.code}/result`)
  }

  const snapshot = await getRoomSnapshot(room.id)
  if (!snapshot) redirect('/')

  return <MonitorClient initial={snapshot} selfId={session.user.id} />
}
