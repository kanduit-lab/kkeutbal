import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { Alert, FixedPage, PageHeader, Panel } from '@/components/ui'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { getMyAccount } from '@/features/auth/profile-actions'
import { peekSsoLinkResult } from '@/features/auth/sso-link-cookies'
import { AccountSummary } from '@/features/auth/components/account-summary'
import { AccountDisplayNameForm } from '@/features/auth/components/account-display-name-form'
import { AccountSsoLinkPanel } from '@/features/auth/components/account-sso-link-panel'
import { getDict, translateError } from '@/lib/i18n/server'

export const dynamic = 'force-dynamic'

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ ssoError?: string }>
}) {
  const [session, { d }, { ssoError }, linkResult] = await Promise.all([
    auth(),
    getDict(),
    searchParams,
    peekSsoLinkResult(),
  ])
  if (!session?.user?.id) redirect('/login?next=/account')

  const result = await getMyAccount()

  return (
    <FixedPage width="content">
      <PageHeader
        className="mb-3 shrink-0"
        title={d.account.title}
        subtitle={d.account.subtitle}
        backHref="/"
        backLabel={d.common.home}
        actions={<LocaleSwitcher />}
      />

      {result.success ? (
        <div className="space-y-4">
          <AccountSummary account={result.data} />
          {result.data.isGuest ? (
            <Alert tone="warn">{d.account.guestNotice}</Alert>
          ) : (
            <AccountDisplayNameForm currentName={result.data.displayName} />
          )}
          <AccountSsoLinkPanel
            sso={result.data.sso}
            ssoError={ssoError ?? null}
            linkResult={linkResult}
          />
        </div>
      ) : (
        <Panel className="space-y-4 py-8 text-center">
          <p className="text-3xl" aria-hidden="true">
            ⚠️
          </p>
          <h2 className="font-bold">{d.account.loadFailed}</h2>
          <Alert tone="error" className="text-left">
            {translateError(d, result.error)}
          </Alert>
        </Panel>
      )}
    </FixedPage>
  )
}
