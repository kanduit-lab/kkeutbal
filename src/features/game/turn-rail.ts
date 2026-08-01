import { nextActorId, type TurnAction } from './turn-order'
import type { BetActionKind, BetStatus } from './types'

/**
 * 노선도(rail) 파생 — 순수 함수, I/O 없음.
 *
 * 세로 모바일에서는 좌석을 원형으로 깔 자리가 없다. 대신 "직전에 누가 뭘 했나 →
 * 지금 누구 차례인가 → 그 다음은 누구인가"만 지하철 노선도처럼 한 줄로 보여준다.
 * 차례 계산은 `turn-order.ts`(서버 `betting/actions.ts`와 공유하는 정본)에 그대로
 * 위임한다 — 여기서 다시 구현하면 서버가 강제하는 차례와 화면이 어긋난다.
 *
 * `nextId`는 "현재 행동자가 아무것도 안 바꿨다고 가정한" 다음 좌석이다. 실제로는
 * 현재 행동자가 레이즈하면 한 바퀴가 더 돌 수도 있으므로 예고일 뿐 보장이 아니다 —
 * 화면에서도 '대기' 톤으로만 쓰고 차례 강제에는 쓰지 않는다.
 */
export interface RailAction {
  readonly id: string
  readonly userId: string
  readonly action: BetActionKind
  readonly amount: number
  readonly status: BetStatus
  readonly seq: number
}

export interface TurnRail {
  /** 직전에 확정된 액션 — 노선도 왼쪽 칸 */
  readonly previous: RailAction | null

  /** 승인 대기 중인 최신 액션. approval 모드에서만 채워진다 */
  readonly pending: RailAction | null

  /** 지금 차례 — 노선도 가운데 칸 */
  readonly currentId: string | null

  /** 예상되는 그 다음 차례 — 노선도 오른쪽 칸 */
  readonly nextId: string | null
}

const EMPTY: TurnRail = { previous: null, pending: null, currentId: null, nextId: null }

function latestWithStatus(actions: readonly RailAction[], status: BetStatus): RailAction | null {
  let latest: RailAction | null = null
  for (const action of actions) {
    if (action.status !== status) continue
    if (!latest || action.seq > latest.seq) latest = action
  }
  return latest
}

export function turnRail(
  participantIds: readonly string[],
  actions: readonly RailAction[],
  { roundActive }: { roundActive: boolean },
): TurnRail {
  if (!roundActive || participantIds.length === 0) return EMPTY

  const previous = latestWithStatus(actions, 'accepted')
  const pending = latestWithStatus(actions, 'pending')

  const turnActions: readonly TurnAction[] = actions
  const currentId = nextActorId(participantIds, turnActions)
  if (!currentId) return { previous, pending, currentId: null, nextId: null }

  // 현재 행동자가 방금 행동한 것처럼 한 칸 더 돌려 다음 좌석을 예고한다. `nextActorId`는
  // anchor(마지막 accepted 액션) 다음부터 찾으므로, 현재 행동자를 anchor 로 세운 가짜
  // 액션을 덧붙이면 같은 규칙(다이·올인 제외, 좌석 순환)이 그대로 적용된다.
  const maxSeq = actions.reduce((max, action) => Math.max(max, action.seq), 0)
  const nextId = nextActorId(participantIds, [
    ...turnActions,
    { userId: currentId, status: 'accepted', action: 'check', seq: maxSeq + 1 },
  ])

  return { previous, pending, currentId, nextId: nextId === currentId ? null : nextId }
}
