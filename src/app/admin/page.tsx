import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { isAdminUser } from '@/features/auth/roles'
import {
  listActiveRooms,
  listGuestTokens,
  listRegistrationCodes,
  listUsers,
} from '@/features/auth/admin-queries'
import { AdminClient } from '@/features/auth/components/admin-client'
import { getSsoSettings } from '@/features/auth/sso-settings'
import { migrateLegacyGuestTokenSecrets } from '@/features/auth/guest-tokens'
import { PromotionsAdmin } from '@/features/promotions/components/promotions-admin'
import { listPromotions } from '@/features/promotions/queries'
import { Badge, ButtonLink, Panel } from '@/components/ui'

export const dynamic = 'force-dynamic'

/** 관리자 콘솔 — 게스트 토큰 발급·회수, 관리자 지정, 방 강제 정산. */
export default async function AdminPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login?next=/admin')

  const isAdmin = await isAdminUser(session.user.id)
  if (!isAdmin) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-6">
        <Panel className="space-y-3 py-8 text-center">
          <p className="text-3xl">🔒</p>
          <h1 className="text-xl font-bold">관리자 전용 페이지입니다</h1>
          <p className="text-sm text-muted">
            가입코드·게스트 토큰·SSO 설정과 관리자 지정은 관리자 계정만 할 수 있습니다
          </p>
          <div className="flex justify-center pt-1">
            <Badge tone="accent">admin</Badge>
          </div>
          <div className="pt-2">
            <ButtonLink href="/" variant="primary" className="w-full">
              홈으로
            </ButtonLink>
          </div>
        </Panel>
      </main>
    )
  }

  // 0011 이전 토큰 원문은 관리자 첫 진입 때 HMAC으로 일괄 전환한다.
  await migrateLegacyGuestTokenSecrets()

  const [tokens, registrationCodes, users, rooms, promotions, ssoSettings] = await Promise.all([
    listGuestTokens(),
    listRegistrationCodes(),
    listUsers(),
    listActiveRooms(),
    listPromotions(),
    getSsoSettings(),
  ])

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-16 pt-8">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl text-muted">
          ←
        </Link>
        <h1 className="font-brush text-3xl font-black">관리자</h1>
      </header>
      <AdminClient
        tokens={tokens}
        registrationCodes={registrationCodes}
        users={users}
        rooms={rooms}
        selfId={session.user.id}
        ssoSettings={ssoSettings}
      />
      <PromotionsAdmin promotions={promotions} />
    </main>
  )
}
