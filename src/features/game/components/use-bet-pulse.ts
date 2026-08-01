'use client'

import { useEffect, useRef, useState } from 'react'
import { betPulse, latestAcceptedId, type BetPulse } from '../bet-pulse'
import { playForAction, playTurnAlert } from '@/lib/sound'
import type { BetActionView } from '../types'

/**
 * 스냅샷 변화를 "소리 한 번 + 연출 한 번"으로 바꾸는 배선. 판정 자체는 순수 함수
 * `bet-pulse.ts`가 하고(테스트도 거기 있다), 여기서는 ref 로 중복 발화만 막는다.
 *
 * ## 왜 브로드캐스트 핸들러가 아니라 여기인가
 * `useRoomEventFeedback`의 `bet.placed` 경로는 세 가지가 빈다: 내 액션은 채널이
 * `self: false`라 돌아오지 않고, payload 에 `userId`가 없어 대리 베팅의 실제 베팅자를
 * 알 수 없고, 판을 끝내는 베팅은 `round.ended`만 쏴서 아예 누락된다. 스냅샷의 `actions`는
 * 세 경우 모두 동일하게 채워지므로 자기/남 구분 없이 한 경로로 처리된다. 대가는 지연
 * (broadcast 250ms~1s 뒤 refetch)인데, 팟이 실제로 움직인 시점과 연출을 맞추는 편이 낫다.
 *
 * ## 초기화 규칙
 * `lastSeen`은 `undefined`로 시작한다 — 방에 들어오자마자 직전 액션 소리가 울리면 안 되기
 * 때문이다. 첫 실행에서 현재 최신 id 를 심어두기만 하고 소리는 내지 않는다. 판이 바뀌면
 * `actions`가 새 판 기준으로 비므로 자연히 다시 심긴다.
 */
export function useBetPulse({
  actions,
  selfId,
  roundId,
  currentActorId,
}: {
  actions: readonly BetActionView[]
  selfId: string
  roundId: string | null
  currentActorId: string | null
}): BetPulse | null {
  const lastSeenRef = useRef<string | null | undefined>(undefined)
  const lastRoundRef = useRef<string | null>(roundId)
  const [pulse, setPulse] = useState<BetPulse | null>(null)

  useEffect(() => {
    // 판이 바뀌면 이전 판의 마지막 액션을 "새 액션"으로 오인하지 않도록 기준을 다시 심는다.
    if (lastRoundRef.current !== roundId) {
      lastRoundRef.current = roundId
      lastSeenRef.current = latestAcceptedId(actions)
      setPulse(null)
      return
    }

    const next = betPulse(actions, { lastSeenActionId: lastSeenRef.current, selfId })
    lastSeenRef.current = latestAcceptedId(actions)
    if (!next) return

    setPulse(next)
    playForAction(next.action, { isSelf: next.isSelf })
  }, [actions, roundId, selfId])

  // 내 차례가 "된 순간"에만 알림음을 낸다. 매 렌더가 아니라 전이에서만 울려야 하므로
  // 직전 값을 따로 들고 비교한다. 첫 실행(마운트)은 전이가 아니므로 건너뛴다.
  const lastActorRef = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    const previous = lastActorRef.current
    lastActorRef.current = currentActorId
    if (previous === undefined) return
    if (previous === currentActorId) return
    if (currentActorId === selfId) playTurnAlert()
  }, [currentActorId, selfId])

  return pulse
}
