import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { joinRoom } from '@/features/game/actions'
import { findRoomByCode, getRoomSnapshot } from '@/features/game/queries'
import { normalizeRoomCode } from '@/features/game/room-code'
import { RoomClient } from '@/features/game/components/room-client'
import { RoomEntryError } from '@/features/game/components/room-entry-error'
import { getVisionSettings } from '@/features/jokbo-advisor/vision/settings'
import { getDict, format } from '@/lib/i18n/server'

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
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

  const visionSettings = await getVisionSettings()
  const visionEnabled =
    visionSettings.enabled &&
    (visionSettings.provider === 'anthropic'
      ? visionSettings.hasAnthropicApiKey
      : visionSettings.hasGeminiApiKey)

  return <RoomClient initial={snapshot} selfId={userId} visionEnabled={visionEnabled} />
}