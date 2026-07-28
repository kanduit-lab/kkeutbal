'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui'

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