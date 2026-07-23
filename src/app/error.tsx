'use client'

import { useEffect } from 'react'
import { Button, ButtonLink, Panel } from '@/components/ui'

/** 라우트 에러 경계 — 원인은 콘솔에만 남기고, 화면에는 복구 동선만 보여준다. */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error.digest ?? error)
  }, [error])

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-6">
      <Panel className="space-y-3 py-8 text-center">
        <p className="text-3xl">🎴</p>
        <h1 className="text-xl font-bold">문제가 발생했습니다</h1>
        <p className="text-sm text-muted">잠시 후 다시 시도하세요.</p>
        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button variant="primary" onClick={reset}>
            다시 시도
          </Button>
          <ButtonLink href="/">홈으로</ButtonLink>
        </div>
      </Panel>
    </main>
  )
}
