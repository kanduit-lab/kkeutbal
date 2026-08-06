import type { MemberRole } from '../types'

/**
 * 좌석을 탭했을 때 "왜 지금은 대신 베팅할 수 없는지"를 결정하는 순수 함수.
 * 차례(turn) 정보는 다루지 않는다 — 그건 betting 쪽 검증이 서버에서 한다.
 * 여기서는 스냅샷만으로 알 수 있는 게이팅 조건(게임 종류·역할·판 존재 여부)만 판단한다.
 */
export type ProxyBlockReason = 'gostop' | 'notDealer' | 'observerTarget' | 'noRound'

export function proxyBlockReason({
  isBettingGame,
  isDealer,
  targetRole,
  hasRound,
}: {
  isBettingGame: boolean
  isDealer: boolean
  targetRole: MemberRole
  hasRound: boolean
}): ProxyBlockReason | null {
  if (!isBettingGame) return 'gostop'
  if (!isDealer) return 'notDealer'
  if (targetRole === 'observer') return 'observerTarget'
  if (!hasRound) return 'noRound'
  return null
}

/**
 * 본인이 스스로 참가↔관전을 옮길 수 있는지. 서버(`member-actions.ts`의 `setMemberRole`)가
 * 셀프 경로에 거는 조건과 같은 규칙을 화면에서 먼저 판단하기 위한 순수 함수 — 진실은 여전히
 * 서버 액션이고, 여기서는 무엇을 보여줄지만 정한다.
 *
 * - `host`: 방장은 자기 역할을 못 바꾼다. 위임이 먼저다.
 * - `roleLocked`: 딜러는 방장이 준 권한이라 스스로 반납하면 되돌릴 사람이 방장뿐이다.
 * - `duringRound`: 판이 도는 중에는 좌석 구성을 바꾸지 않는다(턴 순서가 어긋난다).
 */
export type SelfRoleSwitchBlockReason = 'host' | 'roleLocked' | 'duringRound'

export function selfRoleSwitchBlockReason({
  selfRole,
  hasRound,
}: {
  selfRole: MemberRole
  hasRound: boolean
}): SelfRoleSwitchBlockReason | null {
  if (selfRole === 'host') return 'host'
  if (selfRole !== 'player' && selfRole !== 'observer') return 'roleLocked'
  if (hasRound) return 'duringRound'
  return null
}

/**
 * 방장이 남의 역할을 바꿀 수 있는지. 서버(`setMemberRole`)는 관전자가 걸린 전환
 * (참가→관전, 관전→참가)만 "이번 판 참가자"에 대해 거절한다 — 딜러↔플레이어는 좌석
 * 구성을 바꾸지 않으므로 판 도중에도 통과한다. 화면이 같은 규칙을 먼저 판단해서, 눌리기만
 * 하고 토스트로 거부되던 버튼을 비활성 + 이유로 바꾼다.
 */
export type RoleChangeBlockReason = 'duringRound'

export function roleChangeBlockReason({
  targetRole,
  nextRole,
  targetIsRoundParticipant,
}: {
  targetRole: MemberRole
  nextRole: MemberRole
  targetIsRoundParticipant: boolean
}): RoleChangeBlockReason | null {
  if (!targetIsRoundParticipant) return null
  if (targetRole !== 'observer' && nextRole !== 'observer') return null
  return 'duringRound'
}

/** 자기 자신 좌석을 탭했을 때, 액션바에서 베팅 가능한 상태인지 판단하는 이유 코드 */
export type SelfBlockReason = 'gostop' | 'observerSelf' | 'noRound'

export function selfBlockReason({
  isBettingGame,
  selfRole,
  hasRound,
}: {
  isBettingGame: boolean
  selfRole: MemberRole
  hasRound: boolean
}): SelfBlockReason | null {
  if (!isBettingGame) return 'gostop'
  if (selfRole === 'observer') return 'observerSelf'
  if (!hasRound) return 'noRound'
  return null
}
