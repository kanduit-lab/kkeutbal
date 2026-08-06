'use client'

import { useState } from 'react'
import { useDict } from '@/lib/i18n/client'
import { setMemberRole } from '../member-actions'
import type { MemberRole } from '../types'
import { Button } from '@/components/ui'
import type { RunAction } from './shared'
import { roleChangeBlockReason } from './member-sheet-gating'
import { Section } from './member-sheet-parts'
import { STACK_BUTTON_CLASS } from './button-recipes'

const ROLE_OPTIONS = [
  { role: 'dealer', emoji: '🎩' },
  { role: 'player', emoji: '🎮' },
  { role: 'observer', emoji: '👀' },
] as const

export function RoleSection({
  roomId,
  memberId,
  memberRole,
  targetIsRoundParticipant,
  isPending,
  run,
  runAction,
  onTransferRequest,
}: {
  roomId: string
  memberId: string
  memberRole: MemberRole
  targetIsRoundParticipant: boolean
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
          // 서버가 어차피 거절할 전환은 눌리게 두지 않는다. 판 도중 이번 판 참가자를
          // 관전자로 내리거나 올리는 것이 그 경우다 — 전에는 버튼이 멀쩡히 눌리고 나서
          // 토스트로만 거부돼서, 눌렀는데 아무 일도 안 일어난 것처럼 보였다.
          const blocked =
            !selected &&
            roleChangeBlockReason({
              targetRole: memberRole,
              nextRole: option.role,
              targetIsRoundParticipant,
            }) !== null
          return (
            <Button
              key={option.role}
              selected={selected}
              className={STACK_BUTTON_CLASS}
              loading={firingRole === option.role}
              disabled={isPending || blocked}
              disabledReason={blocked && !isPending ? d.memberSheet.roleDuringRound : undefined}
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

const SELF_ROLE_OPTIONS = [
  { role: 'player', emoji: '🎮' },
  { role: 'observer', emoji: '👀' },
] as const

/**
 * 본인이 자기 참여 상태를 참가↔관전으로 옮기는 영역. 방장 전용 `RoleSection`과 달리 딜러
 * 승격은 없다 — 서버(`setMemberRole`)도 셀프 경로에서는 이 두 값만 받는다.
 * 판이 도는 중에는 서버가 거절하므로 버튼을 지우지 않고 이유를 보여준다.
 */
export function SelfRoleSection({
  roomId,
  selfId,
  selfRole,
  hasRound,
  isPending,
  run,
  runAction,
}: {
  roomId: string
  selfId: string
  selfRole: MemberRole
  hasRound: boolean
  isPending: boolean
  run: (task: () => Promise<boolean>, closeAfter?: boolean) => void
  runAction: RunAction
}) {
  const { d } = useDict()
  const [firingRole, setFiringRole] = useState<MemberRole | null>(null)

  return (
    <Section icon="🙋" title={d.memberSheet.selfRoleTitle} hint={d.memberSheet.selfRoleHint}>
      <div className="grid grid-cols-2 gap-2">
        {SELF_ROLE_OPTIONS.map((option) => {
          const selected = selfRole === option.role
          // 지금 상태를 가리키는 쪽은 계속 또렷하게 둔다 — 눌러도 아무 일이 없다.
          // 반대쪽만 막고, 숨기는 대신 왜 막혔는지 토스트로 알린다.
          return (
            <Button
              key={option.role}
              selected={selected}
              className={STACK_BUTTON_CLASS}
              loading={firingRole === option.role}
              disabled={isPending || (hasRound && !selected)}
              disabledReason={
                hasRound && !selected && !isPending ? d.memberSheet.selfRoleDuringRound : undefined
              }
              onClick={() => {
                if (selected) return
                setFiringRole(option.role)
                run(async () => {
                  const success = await runAction(
                    () => setMemberRole({ roomId, targetUserId: selfId, role: option.role }),
                    () => ({
                      event: 'member.role_changed',
                      payload: { userId: selfId, role: option.role },
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
    </Section>
  )
}
