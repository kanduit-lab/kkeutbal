import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { joinRoom } from '@/features/game/actions'
import { findRoomByCode, getRoomSnapshot } from '@/features/game/queries'
import { normalizeRoomCode } from '@/features/game/room-code'
import { RoomClient } from '@/features/game/components/room-client'
import { getDict } from '@/lib/i18n/server'
import { Button, Panel } from '@/components/ui'

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

  const room = await findRoomByCode(code)
  if (!room) {
    return <ErrorScreen title="방을 찾을 수 없습니다" hint={`코드 ${code} 를 확인하세요.`} />
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
      const { d } = await getDict()
      const key = joined.error.startsWith('errors.')
        ? (joined.error.slice('errors.'.length) as keyof typeof d.errors)
        : null
      return (
        <ErrorScreen title="입장할 수 없습니다" hint={(key && d.errors[key]) || joined.error} />
      )
    }
    snapshot = await getRoomSnapshot(room.id)
  }

  if (!snapshot) {
    return <ErrorScreen title="방 상태를 불러오지 못했습니다" hint="잠시 후 다시 시도하세요." />
  }

  return <RoomClient initial={snapshot} selfId={userId} />
}

function ErrorScreen({ title, hint }: { title: string; hint: string }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-6">
      <Panel className="space-y-3 py-8 text-center">
        <p className="text-3xl">🎴</p>
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="text-sm text-muted">{hint}</p>
        <Link href="/" className="block pt-2">
          <Button variant="primary" className="w-full">
            홈으로
          </Button>
        </Link>
      </Panel>
    </main>
  )
}
