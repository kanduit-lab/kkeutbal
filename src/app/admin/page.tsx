import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { isAdminUser } from '@/features/auth/roles'
import { AdminDashboard } from '@/features/auth/components/admin-dashboard'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { Badge, ButtonLink, PageHeader, PageShell, Panel } from '@/components/ui'
import { getDict } from '@/lib/i18n/server'

export const dynamic = 'force-dynamic'

/** 관리자 콘솔 — 게스트 토큰 발급·회수, 관리자 지정, 방 강제 정산. */
export default async function AdminPage() {
  const [session, { d }] = await Promise.all([auth(), getDict()])
  if (!session?.user?.id) redirect('/login?next=/admin')

  const isAdmin = await isAdminUser(session.user.id)
  if (!isAdmin) {
    return (
      <PageShell width="narrow" center>
        <Panel className="space-y-3 py-8 text-center">
          <p className="text-3xl" aria-hidden="true">
            🔒
          </p>
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
      </PageShell>
    )
  }

  return (
    <PageShell width="wide">
      {/* 콘솔 본문이 전부 사전을 타므로 여기에도 스위처를 둔다 — 실수로 EN 을 눌렀을 때
          홈까지 나가야만 되돌릴 수 있던 구간을 없앤다. */}
      <PageHeader
        title={d.adminDashboard.title}
        subtitle={d.adminDashboard.subtitle}
        backHref="/"
        backLabel={d.common.home}
        actions={<LocaleSwitcher />}
      />
      <AdminDashboard selfId={session.user.id} />
    </PageShell>
  )
}
