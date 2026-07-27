'use client'

import { useEffect } from 'react'
import { Button, ButtonLink, PageShell, Panel } from '@/components/ui'
import { useDict } from '@/lib/i18n/client'

/** 라우트 에러 경계 — 원인은 콘솔에만 남기고, 화면에는 복구 동선만 보여준다. */
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
      {/* 에러 경계는 URL 을 바꾸지 않고 내용만 갈아끼운다 — 바뀐 사실을 알려야 한다. */}
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
