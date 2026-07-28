import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { findRoomByCode, getRoomSnapshot } from '@/features/game/queries'
import { normalizeRoomCode } from '@/features/game/room-code'
import { MonitorClient } from '@/features/game/components/monitor-client'
import { RoomEntryError } from '@/features/game/components/room-entry-error'
import { getDict, format } from '@/lib/i18n/server'

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