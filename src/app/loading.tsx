import { PageShell, Spinner } from '@/components/ui'
import { getDict } from '@/lib/i18n/server'

export default async function Loading() {
  const { d } = await getDict()

  return (
    <PageShell width="content" center>
      <div className="flex justify-center py-16">
        <Spinner label={d.loading.default} />
      </div>
    </PageShell>
  )
}