'use client'

import { Badge } from '@/components/ui'
import type { Dictionary } from '@/lib/i18n/client'
import type { MemberStatus } from '../../member-types'

const TONE: Record<MemberStatus, 'muted' | 'warn' | 'accent'> = {
  active: 'muted',
  suspended: 'warn',
  deleted: 'accent',
}

/** 활성은 기본 상태라 배지를 그리지 않는다 — 모든 줄에 붙으면 눈에 안 들어온다. */
export function MemberStatusBadge({ status, d }: { status: MemberStatus; d: Dictionary }) {
  if (status === 'active') return null
  return <Badge tone={TONE[status]}>{d.adminConsole.status[status]}</Badge>
}
