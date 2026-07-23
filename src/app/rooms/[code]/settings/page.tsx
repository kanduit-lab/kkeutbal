import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { findRoomByCode, getMemberRole } from '@/features/game/queries'
import { normalizeRoomCode } from '@/features/game/room-code'
import { RoomSettingsClient } from '@/features/game/components/room-settings-client'
import { ButtonLink, Panel } from '@/components/ui'

/** 방 옵션 — 방장 전용. */
export default async function RoomSettingsPage({
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

  const role = await getMemberRole(room.id, session.user.id)
  if (role !== 'host') {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-6">
        <Panel className="space-y-3 py-8 text-center">
          <p className="text-3xl">⚙️</p>
          <h1 className="text-xl font-bold">방장만 방 옵션을 바꿀 수 있습니다</h1>
          <div className="pt-2">
            <ButtonLink href={`/rooms/${room.code}`} variant="primary" className="w-full">
              방으로 돌아가기
            </ButtonLink>
          </div>
        </Panel>
      </main>
    )
  }

  return <RoomSettingsClient room={room} />
}
