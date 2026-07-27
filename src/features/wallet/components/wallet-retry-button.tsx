'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui'

/**
 * 지갑 읽기 실패의 재시도. `<Link href="/wallet">` 는 이미 그 URL 에 있을 때
 * RSC 캐시가 살아 있으면 아무 일도 안 일어나서 "눌러도 안 되는 버튼"이 됐다 —
 * router.refresh() 로 서버 렌더를 실제로 다시 받는다.
 */
export function WalletRetryButton({ label }: { label: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  return (
    <Button
      type="button"
      variant="primary"
      className="w-full"
      loading={isPending}
      onClick={() => startTransition(() => router.refresh())}
    >
      {label}
    </Button>
  )
}
