import type { CreditWalletSnapshot } from '../actions'
import { ButtonLink, EmptyState, Panel } from '@/components/ui'
import { format, getDict, type Dictionary } from '@/lib/i18n/server'
import type { Locale } from '@/lib/i18n/config'

export async function WalletSummary({ wallet }: { wallet: CreditWalletSnapshot }) {
  const { d, locale } = await getDict()
  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3" aria-label={d.wallet.balanceSection}>
        <Panel className="space-y-1 py-4">
          <p className="text-xs font-medium text-muted">{d.wallet.available}</p>
          <p className="text-2xl font-black tabular-nums text-gold">
            {wallet.availableBalance.toLocaleString(locale)}
          </p>
          <p className="text-xs text-muted">{d.wallet.availableHint}</p>
        </Panel>
        <Panel className="space-y-1 py-4">
          <p className="text-xs font-medium text-muted">{d.wallet.locked}</p>
          <p className="text-2xl font-black tabular-nums">
            {wallet.lockedBalance.toLocaleString(locale)}
          </p>
          <p className="text-xs text-muted">{d.wallet.lockedHint}</p>
        </Panel>
      </section>
      <Panel className="flex items-center justify-between gap-3 py-4">
        <div>
          <h2 className="font-bold">{d.wallet.total}</h2>
          <p className="mt-0.5 text-xs text-muted">{d.wallet.totalHint}</p>
        </div>
        <p className="shrink-0 text-2xl font-black tabular-nums">
          {wallet.totalBalance.toLocaleString(locale)}
        </p>
      </Panel>
      <section className="space-y-3" aria-labelledby="credit-history-heading">
        <div>
          <h2 id="credit-history-heading" className="font-bold">
            {d.wallet.historyTitle}
          </h2>
          <p className="mt-0.5 text-xs text-muted">{d.wallet.historyHint}</p>
        </div>
        {wallet.transactions.length === 0 ? (
          <EmptyState
            title={d.wallet.historyEmpty}
            hint={d.wallet.historyEmptyHint}
            action={
              <ButtonLink href="/rooms/new" variant="surface" size="sm">
                {d.home.newRoom}
              </ButtonLink>
            }
          />
        ) : (
          <ul className="space-y-2">
            {wallet.transactions.map((transaction) => {
              const change = transaction.deltaAvailable + transaction.deltaLocked
              const movement = transaction.deltaLocked
                ? format(d.wallet.movement, {
                    available: signed(locale, transaction.deltaAvailable),
                    locked: signed(locale, transaction.deltaLocked),
                  })
                : signed(locale, transaction.deltaAvailable)
              return (
                <li key={transaction.id}>
                  <Panel className="space-y-1.5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 break-words font-bold">{transaction.reason}</p>
                      <p
                        className={`shrink-0 text-lg font-black tabular-nums ${
                          change > 0 ? 'text-win' : change < 0 ? 'text-accent' : 'text-muted'
                        }`}
                      >
                        {change === 0 ? movement : signed(locale, change)}
                      </p>
                    </div>
                    <p className="text-xs text-muted">
                      {format(d.wallet.entryMeta, {
                        kind: transactionLabel(d, transaction.kind),
                        at: formatDateTime(locale, transaction.createdAt),
                        available: transaction.availableAfter.toLocaleString(locale),
                        locked: transaction.lockedAfter.toLocaleString(locale),
                      })}
                    </p>
                  </Panel>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function signed(locale: Locale, value: number): string {
  return `${value > 0 ? '+' : ''}${value.toLocaleString(locale)}`
}

function transactionLabel(
  d: Dictionary,
  kind: CreditWalletSnapshot['transactions'][number]['kind'],
): string {
  switch (kind) {
    case 'admin_grant':
      return d.wallet.kind.adminGrant
    case 'admin_revoke':
      return d.wallet.kind.adminRevoke
    case 'room_lock':
      return d.wallet.kind.roomLock
    case 'room_settlement':
      return d.wallet.kind.roomSettlement
    case 'correction':
      return d.wallet.kind.correction
  }
}

function formatDateTime(locale: Locale, value: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}