import type { BetActionKind } from './types'

/**
 * "방금 새 액션이 확정됐다"를 스냅샷에서 뽑아내는 순수 함수 — 소리·모션의 단일 트리거.
 *
 * ## 왜 브로드캐스트가 아니라 스냅샷인가
 * `bet.placed` 브로드캐스트는 세 가지 이유로 연출의 기준이 될 수 없다.
 * 1. 채널이 `broadcast: { self: false }`라 **내 액션은 나에게 돌아오지 않는다** — 내 연출만
 *    따로 명령형으로 쏴야 해서 자기/남 경로가 갈라진다.
 * 2. payload 에 `userId`가 없다. envelope 의 `actorId`는 대리 베팅(딜러 대행)일 때 딜러를
 *    가리키므로 "누가 걸었나"를 알 수 없다.
 * 3. 판을 끝내는 베팅은 `bet.placed` 대신 `round.ended`만 쏜다 — 마지막 베팅이 조용해진다.
 *
 * 스냅샷의 `actions`는 세 경우 모두 동일하게 채워지므로 여기 하나만 보면 된다. 대신
 * 브로드캐스트(passive)보다 250ms~1s 늦다 — 즉각성보다 정확성을 택한 트레이드오프다.
 *
 * ## 중복 발화 방지
 * 호출부는 마지막으로 연출한 액션 id 를 ref 로 들고 다시 넘긴다. 20초 폴링이나 무관한 필드
 * 변경으로 스냅샷이 새로 와도 id 가 같으면 `null`이다. `lastSeenActionId`가 `undefined`면
 * "아직 아무것도 본 적 없음"(첫 진입)이라 울리지 않는다 — 방에 들어오자마자 직전 액션 소리가
 * 나면 안 되기 때문이다.
 *
 * 한 번의 refetch 창에 accepted 액션이 둘 이상 들어오면 **가장 마지막 것 하나만** 울린다.
 * 소리를 겹쳐 쌓는 것보다 낫고, 팟 금액은 어차피 합계로 한 번에 갱신되기 때문이다.
 */
export interface PulseAction {
  readonly id: string
  readonly userId: string
  readonly action: BetActionKind
  readonly amount: number
  readonly status: string
  readonly seq: number
}

export interface BetPulse {
  readonly actionId: string
  readonly userId: string
  readonly action: BetActionKind
  readonly amount: number

  /** 내가 한 액션인지 — 화면 연출을 자기/남으로 나눌 때 쓴다 */
  readonly isSelf: boolean
}

function latestAccepted(actions: readonly PulseAction[]): PulseAction | null {
  // status 로 먼저 거르고 그중 seq 최댓값을 고른다. 순서를 뒤에서부터 훑는 방식은 서버가
  // 주는 seq 오름차순 정렬에 의존하는데, 그 정렬은 `room-snapshot-queries.ts`의 쿼리 하나에만
  // 걸려 있어 호출부가 바뀌면 조용히 깨진다. 먼저 거르므로 pending 이 더 큰 seq 를 쥐고 있어도
  // 잡히지 않는다 — `turn-rail.ts`의 `latestWithStatus`와 같은 규칙이다.
  let latest: PulseAction | null = null
  for (const action of actions) {
    if (action.status !== 'accepted') continue
    if (!latest || action.seq > latest.seq) latest = action
  }
  return latest
}

export function latestAcceptedId(actions: readonly PulseAction[]): string | null {
  return latestAccepted(actions)?.id ?? null
}

export function betPulse(
  actions: readonly PulseAction[],
  {
    lastSeenActionId,
    selfId,
  }: {
    /** `undefined`면 첫 진입 — 울리지 않는다. `null`은 "본 적은 있고 그때 액션이 없었다" */
    lastSeenActionId: string | null | undefined
    selfId: string
  },
): BetPulse | null {
  const latest = latestAccepted(actions)
  if (!latest) return null
  if (lastSeenActionId === undefined) return null
  if (latest.id === lastSeenActionId) return null

  return {
    actionId: latest.id,
    userId: latest.userId,
    action: latest.action,
    amount: latest.amount,
    isSelf: latest.userId === selfId,
  }
}
