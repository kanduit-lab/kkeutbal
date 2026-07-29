'use client'

import { Alert } from '@/components/ui'
import { useDict } from '@/lib/i18n/client'

export function GostopWaitPanel() {
  const { d } = useDict()

  return (
    <Alert tone="info" title={d.room.gostopWaitTitle} className="mt-4">
      {d.room.gostopWaitHint}
    </Alert>
  )
}
