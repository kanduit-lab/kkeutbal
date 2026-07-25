import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { isAdminUser } from '@/features/auth/roles'
import { AdminDashboard } from '@/features/auth/components/admin-dashboard'
import { Badge, ButtonLink, Panel } from '@/components/ui'
import { getDict } from '@/lib/i18n/server'

export const dynamic = 'force-dynamic'

/** 관리자 콘솔 — 게스트 토큰 발급·회수, 관리자 지정, 방 강제 정산. */
export default async function AdminPage() {
  const [session, { d }] = await Promise.all([auth(), getDict()])
  if (!session?.user?.id) redirect('/login?next=/admin')

  const isAdmin = await isAdminUser(session.user.id)
  if (!isAdmin) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-6">
        <Panel className="space-y-3 py-8 text-center">
          <p className="text-3xl">🔒</p>
          <h1 className="text-xl font-bold">{d.adminDashboard.deniedTitle}</h1>
          <p className="text-sm text-muted">{d.adminDashboard.deniedBody}</p>
          <div className="flex justify-center pt-1">
            <Badge tone="accent">admin</Badge>
          </div>
          <div className="pt-2">
            <ButtonLink href="/" variant="primary" className="w-full">
              {d.common.home}
            </ButtonLink>
          </div>
        </Panel>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-10">
      <header className="flex items-start gap-3">
        <Link
          href="/"
          aria-label={d.common.home}
          className="mt-1 grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 text-xl text-muted transition-colors hover:text-text"
        >
          ←
        </Link>
        <div>
          <h1 className="font-brush text-3xl font-black sm:text-4xl">
            {d.adminDashboard.title}
          </h1>
          <p className="mt-1 text-sm text-muted">{d.adminDashboard.subtitle}</p>
        </div>
      </header>
      <AdminDashboard selfId={session.user.id} />
    </main>
  )
}
