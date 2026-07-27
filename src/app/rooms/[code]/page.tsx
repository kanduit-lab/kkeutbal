import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { joinRoom } from '@/features/game/actions'
import { findRoomByCode, getRoomSnapshot } from '@/features/game/queries'
import { normalizeRoomCode } from '@/features/game/room-code'
import { RoomClient } from '@/features/game/components/room-client'
import { RoomEntryError } from '@/features/game/components/room-entry-error'
import { getDict, format } from '@/lib/i18n/server'

/**
 * 방 화면. QR/링크로 바로 들어와도 되도록, 참가자가 아니면 자동 입장을 시도한다.
 */
export default async function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
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

  if (room.status === 'settled' || room.status === 'closed') {
    redirect(`/rooms/${room.code}/result`)
  }

  let snapshot = await getRoomSnapshot(room.id)
  const isMember = snapshot?.members.some((member) => member.userId === userId) ?? false

  if (!isMember) {
    const joined = await joinRoom(code)
    if (!joined.success) {
      // joinRoom 은 `errors.*` 사전 키를 돌려준다 — 그대로 그리면 화면에 키가 노출된다.
      // 사전에 없는 새 키가 오면 원문(= 키 문자열) 대신 일반 실패 문구로 떨어뜨린다.
      const key = joined.error.startsWith('errors.')
        ? (joined.error.slice('errors.'.length) as keyof typeof d.errors)
        : null
      return (
        <RoomEntryError
          title={d.room.cannotJoinTitle}
          hint={(key ? d.errors[key] : undefined) ?? d.errors.joinRoomFailed}
          homeLabel={d.common.home}
        />
      )
    }
    snapshot = await getRoomSnapshot(room.id)
  }

  if (!snapshot) {
    return (
      <RoomEntryError
        title={d.room.snapshotFailedTitle}
        hint={d.room.snapshotFailedHint}
        homeLabel={d.common.home}
      />
    )
  }

  return <RoomClient initial={snapshot} selfId={userId} />
}
