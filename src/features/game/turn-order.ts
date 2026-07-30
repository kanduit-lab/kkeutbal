import type { BetActionKind, BetStatus } from './types'

/**
 * 턴 순서 계산 — 순수 함수, I/O 없음. `placeBet`/`approveBet`(서버, `betting/actions.ts`)와
 * `GameTable`(클라이언트 좌석 강조) 양쪽이 이 한 곳만 쓴다.
 *
 * ## 좌석 순서 기준 (선행 확인 결과)
 * `participantIds`는 seatNo 오름차순으로 이미 정렬된 배열로 받는다(`roomMembers.seatNo asc` —
 * `getMembers`/`startRound`가 참가자를 조회하는 순서와 동일). 이 순서가 실제 섯다·포커의
 * 시계방향 베팅 순서와 일치하는지는 다음 근거로 확인했다: `round-actions.ts`의 `startRound`가
 * `round_fairness_participants.dealOrder`("선" = index 0, 카드를 나눠주는 순서)를 바로 이
 * seatNo asc 참가자 배열의 인덱스로 채운다. 카드를 나눠준 순서와 베팅을 받는 순서가 서로 다른
 * 좌석 기준을 쓸 이유가 없으므로, 베팅 순서도 같은 seatNo asc를 "선"부터 도는 기준으로 채택했다.
 * 이 앱에는 라운드마다 도는 딜러 버튼 개념이 없다 — "선"은 항상 seatNo가 가장 낮은 참가자로
 * 고정이다(스키마에도 그런 컬럼이 없다). 딜러 버튼 로테이션이 필요하면 별도 스키마 필드가
 * 있어야 하므로 이번 범위 밖이다.
 *
 * ## 고친 것 — 라운드 시작 시 다음 행동자 미정의
 * 기존 `game-table.tsx`의 `nextActorId`는 이번 라운드에 accepted 액션이 하나도 없으면(라운드
 * 시작 직후) `null`을 반환했다. 좌석 강조 표시 전용이었을 때는 "아직 아무도 안 함" 정도로
 * 넘어갔지만, 서버가 이 값으로 차례를 강제하려면 첫 액션자가 반드시 정해져야 한다 — 정해지지
 * 않으면 첫 베팅을 아무도 할 수 없다. 이 함수는 그 경우 "선"(seatNo 최솟값)부터 찾는다.
 *
 * ## 제외 규칙
 * - fold·allin 상태인 참가자는 더 이상 행동할 수 없으므로 다음 차례 후보에서 제외한다.
 * - `participantIds`에 없는 사용자(관전자, 중도 퇴장자, 이번 라운드 미참가자)는 호출부가 미리
 *   걸러서 넘겨야 한다 — 이 함수는 주어진 배열의 순서와 구성만 신뢰한다.
 * - 마지막 행동자(anchor)가 `participantIds`에 없으면(중도 퇴장 등) "선"부터 방어적으로 다시
 *   찾는다. 원래 자리를 정확히 복원할 수 없는 예외 상황이므로 완벽한 재개보다 교착 방지를
 *   우선했다 — 그렇지 않으면 마지막 행동자가 방을 나가는 순간 `nextActorId`가 영구히 `null`을
 *   반환해 아무도 차례를 받지 못하고 베팅이 멈춘다(서버 강제 전에는 표시만 어긋나서 드러나지
 *   않던 문제).
 *
 * ## 한 바퀴 완료 판정과의 관계
 * fold·allin이 아닌 참가자가 하나도 없으면 `null`을 반환한다 — "더 이상 행동할 사람 없음"
 * 신호다. 이 함수는 "콜까지 맞춰졌는지"(쇼다운 판정)는 보지 않는다 — 그건
 * `betting/round-completion.ts`의 몫이다. 두 판정이 어긋나면(예: 콜은 맞았지만 다음 사람이
 * 아직 남아 있음) 이 함수는 여전히 그 다음 사람을 가리킨다 — 판 완료 여부와 무관하게 "누구
 * 차례인가"만 답한다.
 */
export interface TurnAction {
  readonly userId: string
  readonly status: BetStatus
  readonly action: BetActionKind
  readonly seq: number
}

export function nextActorId(
  participantIds: readonly string[],
  actions: readonly TurnAction[],
): string | null {
  const n = participantIds.length
  if (n === 0) return null

  const lastAcceptedByUser = new Map<string, TurnAction>()
  let anchor: TurnAction | null = null
  for (const action of actions) {
    if (action.status !== 'accepted') continue
    const current = lastAcceptedByUser.get(action.userId)
    if (!current || action.seq > current.seq) lastAcceptedByUser.set(action.userId, action)
    if (!anchor || action.seq > anchor.seq) anchor = action
  }

  const isActive = (userId: string): boolean => {
    const last = lastAcceptedByUser.get(userId)
    return last?.action !== 'fold' && last?.action !== 'allin'
  }

  const searchFromSeatOrder = (): string | null => {
    for (let i = 0; i < n; i += 1) {
      const candidate = participantIds[i]!
      if (isActive(candidate)) return candidate
    }
    return null
  }

  if (!anchor) return searchFromSeatOrder()

  const anchorIdx = participantIds.indexOf(anchor.userId)
  if (anchorIdx < 0) return searchFromSeatOrder()

  for (let offset = 1; offset < n; offset += 1) {
    const candidate = participantIds[(anchorIdx + offset) % n]!
    if (isActive(candidate)) return candidate
  }
  return null
}

/** `nextActorId(...) === userId`의 축약 — 서버 검증에서 의도를 드러내는 이름으로 쓴다. */
export function isActorsTurn(
  participantIds: readonly string[],
  actions: readonly TurnAction[],
  userId: string,
): boolean {
  return nextActorId(participantIds, actions) === userId
}
