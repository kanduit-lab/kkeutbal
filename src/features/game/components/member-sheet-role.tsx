'use client'

import { useState } from 'react'
import { useDict } from '@/lib/i18n/client'
import { setMemberRole } from '../member-actions'
import type { MemberRole } from '../types'
import { Button } from '@/components/ui'
import type { RunAction } from './shared'
import { Section } from './member-sheet-parts'

const ROLE_OPTIONS = [
  { role: 'dealer', emoji: '🎩' },
  { role: 'player', emoji: '🎮' },
  { role: 'observer', emoji: '👀' },
] as const

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