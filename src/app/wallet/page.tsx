import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { Alert, FixedPage, PageHeader, Panel } from '@/components/ui'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { WalletSummary } from '@/features/wallet/components/wallet-summary'
import { WalletRetryButton } from '@/features/wallet/components/wallet-retry-button'
import { getMyCreditWallet } from '@/features/wallet/actions'
import { getDict, translateError } from '@/lib/i18n/server'

export const dynamic = 'force-dynamic'

export default async function WalletPage() {
  const [session, { d }] = await Promise.all([auth(), getDict()])
  if (!session?.user?.id) redirect('/login?next=/wallet')

  const result = await getMyCreditWallet()
  return (
    <FixedPage width="content">
      <PageHeader
        className="mb-3 shrink-0"
        title={d.wallet.title}
        subtitle={d.wallet.subtitle}
        backHref="/"
        backLabel={d.common.home}
        actions={<LocaleSwitcher />}
      />

      {result.success ? (
        <WalletSummary wallet={result.data} />
      ) : (
        <Panel className="space-y-4 py-8 text-center">
          <p className="text-3xl" aria-hidden="true">
            ⚠️
          </p>
          <h2 className="font-bold">{d.wallet.loadFailed}</h2>
          <Alert tone="error" className="text-left">
            {translateError(d, result.error)}
          </Alert>
          <WalletRetryButton label={d.common.retry} />
        </Panel>
      )}
    </FixedPage>
  )
}