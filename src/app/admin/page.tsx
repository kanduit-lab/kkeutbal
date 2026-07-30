import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { isAdminUser } from '@/features/auth/roles'
import { AdminDashboard } from '@/features/auth/components/admin-dashboard'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { ButtonLink, FixedPage, PageHeader, PageShell, Panel } from '@/components/ui'
import { getDict } from '@/lib/i18n/server'

export const dynamic = 'force-dynamic'

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
    <FixedPage width="wide">
      <PageHeader
        className="mb-3 shrink-0"
        title={d.adminDashboard.title}
        subtitle={d.adminDashboard.subtitle}
        backHref="/"
        backLabel={d.common.home}
        actions={<LocaleSwitcher />}
      />
      <AdminDashboard selfId={session.user.id} />
    </FixedPage>
  )
}