import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { ButtonLink, Panel } from '@/components/ui'
import { WalletSummary } from '@/features/wallet/components/wallet-summary'
import { getMyCreditWallet } from '@/features/wallet/actions'

export const dynamic = 'force-dynamic'

/** 계정에 귀속되는 가상 크레딧과 변경 불가 거래 기록. */
export default async function WalletPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login?next=/wallet')

  const result = await getMyCreditWallet()
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-16 pt-8 lg:px-8">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl text-muted" aria-label="홈으로">
          ←
        </Link>
        <div>
          <h1 className="font-brush text-4xl font-black lg:text-5xl">내 가상 크레딧</h1>
          <p className="text-xs text-muted">계정 귀속 · 현금 가치 없음 · 모든 변동 기록 보존</p>
        </div>
      </header>

      {result.success ? (
        <WalletSummary wallet={result.data} />
      ) : (
        <Panel className="space-y-4 py-8 text-center">
          <p className="text-3xl">⚠️</p>
          <div>
            <h2 className="font-bold">가상 크레딧을 불러오지 못했습니다</h2>
            <p className="mt-1 text-sm text-muted">{result.error}</p>
          </div>
          <ButtonLink href="/wallet" variant="primary" className="w-full">
            다시 시도
          </ButtonLink>
        </Panel>
      )}
    </main>
  )
}
