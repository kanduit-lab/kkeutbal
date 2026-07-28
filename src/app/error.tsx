'use client'

import { useEffect } from 'react'
import { Button, ButtonLink, PageShell, Panel } from '@/components/ui'
import { useDict } from '@/lib/i18n/client'

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const { d } = useDict()

  useEffect(() => {
    console.error(error.digest ?? error)
  }, [error])

  return (
    <PageShell width="narrow" center>
      <div role="alert">
        <Panel className="space-y-3 py-8 text-center">
          <p aria-hidden className="text-3xl">
            🎴
          </p>
          <h1 className="text-xl font-bold">{d.errorPage.title}</h1>
          <p className="text-sm text-muted">{d.errorPage.body}</p>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button variant="primary" onClick={reset}>
              {d.errorPage.retry}
            </Button>
            <ButtonLink href="/">{d.common.home}</ButtonLink>
          </div>
        </Panel>
      </div>
    </PageShell>
  )
}