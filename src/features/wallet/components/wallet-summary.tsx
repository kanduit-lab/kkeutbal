import type { CreditWalletSnapshot } from '../actions'
import { getDict } from '@/lib/i18n/server'
import { CreditHistory } from './credit-history'

export async function WalletSummary({ wallet }: { wallet: CreditWalletSnapshot }) {
  const { d, locale } = await getDict()
  const tiles = [
    {
      label: d.wallet.available,
      hint: d.wallet.availableHint,
      value: wallet.availableBalance,
      valueClass: 'text-gold',
    },
    {
      label: d.wallet.locked,
      hint: d.wallet.lockedHint,
      value: wallet.lockedBalance,
      valueClass: '',
    },
    {
      label: d.wallet.total,
      hint: d.wallet.totalHint,
      value: wallet.totalBalance,
      valueClass: '',
    },
  ]

  return (
    <>
      <section
        className="mb-3 grid shrink-0 grid-cols-3 gap-2"
        aria-label={d.wallet.balanceSection}
      >
        {tiles.map((tile) => (
          <div key={tile.label} className="lacquer rounded-2xl px-2 py-2.5 text-center">
            <p className="text-micro font-medium text-muted">{tile.label}</p>
            <p
              className={`text-xl font-black leading-tight tabular-nums lg:text-2xl ${tile.valueClass}`}
            >
              {tile.value.toLocaleString(locale)}
            </p>
            <p className="mt-0.5 hidden text-xs text-muted/70 sm:block">{tile.hint}</p>
          </div>
        ))}
      </section>
      <CreditHistory transactions={wallet.transactions} />
    </>
  )
}
