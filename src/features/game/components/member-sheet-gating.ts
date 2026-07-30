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
