import { Panel, PanelHeader } from '@/components/ui'
import { getDict } from '@/lib/i18n/server'
import type { AccountView } from '../profile-actions'

export async function AccountSummary({ account }: { account: AccountView }) {
  const { d, locale } = await getDict()

  const rows: ReadonlyArray<{ label: string; value: string }> = [
    ...(account.username
      ? [{ label: d.account.usernameLabel, value: account.username }]
      : []),
    { label: d.account.accountTypeLabel, value: d.adminConsole.accountType[account.authType] },
    { label: d.account.phoneLabel, value: account.phoneMasked ?? d.account.phoneNotSet },
    {
      label: d.account.joinedAtLabel,
      value: new Date(account.createdAt).toLocaleDateString(locale),
    },
  ]

  return (
    <Panel className="space-y-4">
      <PanelHeader title={d.account.summaryTitle} />
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {rows.map((row) => (
          <div key={row.label} className="rounded-xl bg-inset px-3 py-2.5">
            <dt className="text-micro font-medium text-muted">{row.label}</dt>
            <dd className="mt-0.5 truncate text-sm font-bold">{row.value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  )
}
