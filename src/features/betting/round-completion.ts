import { contributedBy, roundBetState, type AcceptedBetAction } from './round-bet-state'

/**
 * 판 자동 종료 판정 — 순수 함수, I/O 없음. `betting/actions.ts`(서버, 실제 자동 종료 트리거)와
 * `game/components/dealer-panel-controls.ts`(클라이언트, 승자 확정 폼 자동 오픈)가 공유한다.
 *
 * - `single_survivor`: fold하지 않은 참가자가 1명 남았다. 카드 비교가 필요 없으므로
 *   (`docs/12-handoff.md` 9번) 그 사람을 승자로 완전 자동 확정할 수 있다.
 * - `showdown_ready`: fold하지 않은 참가자가 전부 정산됐다 — 누적 베팅이 같아졌거나(콜 완료)
 *   올인이라 더 낼 칩이 없다. 카드로 승자를 가려야 하므로 이 함수는 자동으로 승자를 정하지 않고,
 *   "쇼다운 단계"라는 신호와 남은 참가자 목록(`contenderIds`)만 준다 — 검증 딜(공정 딜) 방이면
 *   서버가 이 목록으로 카드 승부를 자동 판정할 수 있고, 아니면 딜러가 카드를 보고 확정한다.
 * - `active`: 아직 베팅이 끝나지 않았다.
 *
 * ## 올인 참가자를 정산 완료로 보는 이유
 * 올인한 사람은 더 낼 칩이 없고, `turn-order.ts`는 그를 차례에서 빼며 `bet-semantics.ts`는 그의
 * 추가 액션을 `errors.cannotBetAfterAllIn`으로 막는다. 그러므로 "기여액이 `currentToCall`과 같아야
 * 한다"를 그에게도 요구하면 아무도 풀 수 없는 조건이 된다 — 실제로 그래서 판이 잠겼다(딜러의 판
 * 종료·판 무효 말고는 탈출구가 없었다).
 *
 * 애초에 콜 금액을 못 채우는 짧은 올인은 `bet-amount-rule.ts`가 규칙 층에서 막는다(사이드팟을
 * 만들지 않기로 한 결정, 근거는 그쪽 주석과 `docs/04-game-engines.md` "베팅 규칙" 절). 여기서
 * 남는 경우는 두 가지뿐이다: ① 콜을 채운 정상 올인 위로 남들이 더 올린 판 — 초과분은 그 위험을
 * 알고 더 건 사람들끼리의 몫이다. ② 규칙 강화 전에 이미 기록된 짧은 올인 행 — 그런 판도 여기서
 * 종료 단계에 도달해야 잠기지 않는다.
 *
 * `participantIds`는 이번 라운드의 유효 참가자(관전자 제외, 중도 퇴장자 제외) 전체를 넘겨야
 * 한다 — 일부만 넘기면 "아직 액션 안 한 참가자를 빼먹어 완료로 오판" 같은 오탐이 난다.
 * `actions`는 이번 라운드의 베팅 액션 전체(모든 status)를 넘기면 된다 — 내부에서 accepted만
 * 걸러 쓴다.
 */
export type RoundCompletion =
  | { readonly kind: 'active' }
  | { readonly kind: 'single_survivor'; readonly winnerId: string }
  | { readonly kind: 'showdown_ready'; readonly contenderIds: readonly string[] }

export function computeRoundCompletion(
  participantIds: readonly string[],
  actions: readonly AcceptedBetAction[],
): RoundCompletion {
  const lastAcceptedByUser = new Map<string, AcceptedBetAction>()
  for (const action of actions) {
    if (action.status !== 'accepted') continue
    lastAcceptedByUser.set(action.userId, action)
  }

  const contenders = participantIds.filter(
    (userId) => lastAcceptedByUser.get(userId)?.action !== 'fold',
  )
  if (contenders.length <= 1) {
    const winnerId = contenders[0]
    return winnerId ? { kind: 'single_survivor', winnerId } : { kind: 'active' }
  }

  const state = roundBetState(actions)
  const allSettled = contenders.every((userId) => {
    const last = lastAcceptedByUser.get(userId)
    if (!last) return false
    // 올인은 더 낼 칩이 없다 = 이 판에서 할 수 있는 것을 다 했다.
    if (last.action === 'allin') return true
    return contributedBy(state, userId) === state.currentToCall
  })
  return allSettled ? { kind: 'showdown_ready', contenderIds: contenders } : { kind: 'active' }
}
