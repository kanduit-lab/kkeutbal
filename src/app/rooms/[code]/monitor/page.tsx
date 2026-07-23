import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { findRoomByCode, getRoomSnapshot } from '@/features/game/queries'
import { normalizeRoomCode } from '@/features/game/room-code'
import { MonitorClient } from '@/features/game/components/monitor-client'

/**
 * 모니터링 화면 — 판 옆 태블릿·TV 용 읽기 전용 전광판.
 * 조작 UI 없이 테이블·팟·기록만 크게 보여준다.
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

  // 참가자가 아니면 방 화면으로 — 거기서 자동 입장 후 다시 올 수 있다.
  if (!snapshot.members.some((member) => member.userId === session.user.id)) {
    redirect(`/rooms/${room.code}`)
  }

  return <MonitorClient initial={snapshot} selfId={session.user.id} />
}
