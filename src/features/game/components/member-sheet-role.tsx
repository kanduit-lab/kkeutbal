'use client'

import { useState } from 'react'
import { useDict } from '@/lib/i18n/client'
import { setMemberRole } from '../member-actions'
import type { MemberRole } from '../types'
import { Button } from '@/components/ui'
import type { RunAction } from './shared'
import { Section } from './member-sheet-parts'

/** 역할 선택지 — 라벨은 사전(d.roles)에서 가져온다. */
const ROLE_OPTIONS = [
  { role: 'dealer', emoji: '🎩' },
  { role: 'player', emoji: '🎮' },
  { role: 'observer', emoji: '👀' },
] as const

/**
 * 역할 변경 섹션 — 방장 전용. "방장 위임"은 transferHost 확인 다이얼로그를 여는
 * 요청만 올리고, 다이얼로그 자체는 MemberSheet 가 소유한다.
 */
export function RoleSection({
  roomId,
  memberId,
  memberRole,
  isPending,
  run,
  runAction,
  onTransferRequest,
}: {
  roomId: string
  memberId: string
  memberRole: MemberRole
  isPending: boolean
  run: (task: () => Promise<boolean>, closeAfter?: boolean) => void
  runAction: RunAction
  onTransferRequest: () => void
}) {
  const { d } = useDict()
  /** 요청이 걸린 역할 — 세 칸이 한꺼번에 도는 대신 누른 칸만 돌게 한다. */
  const [firingRole, setFiringRole] = useState<MemberRole | null>(null)
  return (
    <Section icon="🎭" title={d.memberSheet.roleTitle} hint={d.memberSheet.roleHint}>
      <div className="grid grid-cols-3 gap-2">
        {ROLE_OPTIONS.map((option) => {
          const selected = memberRole === option.role
          return (
            <Button
              key={option.role}
              selected={selected}
              className="min-h-16 flex-col gap-0.5"
              loading={firingRole === option.role}
              disabled={isPending}
              onClick={() => {
                // 이미 선택된 역할 — 재전송할 것이 없다. 시각은 selected 로 유지된다.
                if (selected) return
                setFiringRole(option.role)
                run(async () => {
                  const success = await runAction(
                    () =>
                      setMemberRole({
                        roomId,
                        targetUserId: memberId,
                        role: option.role,
                      }),
                    () => ({
                      event: 'member.role_changed',
                      payload: { userId: memberId, role: option.role },
                    }),
                  )
                  setFiringRole(null)
                  return success
                })
              }}
            >
              <span className="text-xl leading-none" aria-hidden>
                {option.emoji}
              </span>
              <span className="text-sm">{d.roles[option.role]}</span>
            </Button>
          )
        })}
      </div>
      <Button
        variant="danger"
        className="w-full"
        disabled={isPending}
        aria-haspopup="dialog"
        onClick={onTransferRequest}
      >
        👑 {d.memberSheet.transferHost}
      </Button>
    </Section>
  )
}
