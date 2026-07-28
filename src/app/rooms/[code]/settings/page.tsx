import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getDict, format } from '@/lib/i18n/server'
import { findRoomByCode, getMemberRole } from '@/features/game/queries'
import { normalizeRoomCode } from '@/features/game/room-code'
import { RoomSettingsClient } from '@/features/game/components/room-settings-client'
import { RoomEntryError } from '@/features/game/components/room-entry-error'
import { ButtonLink, Panel } from '@/components/ui'

export default async function RoomSettingsPage({ params }: { params: Promise<{ code: string }> }) {
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

  const role = await getMemberRole(room.id, session.user.id)
  if (role !== 'host') {
    return (
      <main
        id="main"
        className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-6"
      >
        <Panel className="space-y-3 py-8 text-center">
          <p className="text-3xl">⚙️</p>
          <h1 className="text-xl font-bold">{d.settings.hostOnly}</h1>
          <div className="pt-2">
            <ButtonLink href={`/rooms/${room.code}`} variant="primary" className="w-full">
              {d.settings.backToRoom}
            </ButtonLink>
          </div>
        </Panel>
      </main>
    )
  }

  return <RoomSettingsClient room={room} />
}