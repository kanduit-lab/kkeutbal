import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { Alert, PageHeader, PageShell, Panel } from '@/components/ui'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { WalletSummary } from '@/features/wallet/components/wallet-summary'
import { WalletRetryButton } from '@/features/wallet/components/wallet-retry-button'
import { getMyCreditWallet } from '@/features/wallet/actions'
import { getDict, translateError } from '@/lib/i18n/server'

export const dynamic = 'force-dynamic'

/** 계정에 귀속되는 가상 크레딧과 변경 불가 거래 기록. */
export default async function WalletPage() {
  const [session, { d }] = await Promise.all([auth(), getDict()])
  if (!session?.user?.id) redirect('/login?next=/wallet')

  const result = await getMyCreditWallet()
  return (
    <PageShell width="content">
      {/* 지갑 본문 전체가 사전을 타므로 여기서도 로케일을 되돌릴 수 있어야 한다. */}
      <PageHeader
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
          {/* 원문을 그대로 찍으면 `errors.loginRequired` 같은 내부 토큰이 화면에 뜬다. */}
          <Alert tone="error" className="text-left">
            {translateError(d, result.error)}
          </Alert>
          {/* 같은 URL 로의 Link 이동은 RSC 캐시가 살아 있으면 아무 일도 안 일어난다 —
              재요청은 router.refresh() 로 한다. */}
          <WalletRetryButton label={d.common.retry} />
        </Panel>
      )}
    </PageShell>
  )
}
