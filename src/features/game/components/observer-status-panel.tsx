'use client'

import { Panel } from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'
import { nextActorId } from '../turn-order'
import type { RoomSnapshot } from '../types'

/**
 * 섯다·포커 관전자용 상태 표면.
 *
 * 관전자는 `canBet`이 false라 `ActionBar`가 안 뜨고, 딜러가 아니라 `DealerQuickBar`도 없다.
 * 그래서 판이 도는 동안 화면에서 "지금 누가 무엇을 하는 중인지" 알려주는 게 하나도 없었다
 * (`test/dom/game-role-rendering.test.tsx`가 이 조합을 짚어서 드러났다). 고스톱 비딜러에게
 * `GostopWaitPanel`이 하는 역할을 베팅 게임 관전자에게 해준다.
 *
 * 차례 계산은 서버·좌석 강조와 같은 `turn-order.ts` 순수 함수를 쓴다 — 표시가 서버 판정과
 * 갈라지지 않게.
 */
export function ObserverStatusPanel({ snapshot }: { snapshot: RoomSnapshot }) {
  const { d } = useDict()
  const hasRound = Boolean(snapshot.currentRound)

  const participantIds = snapshot.members
    .filter((member) => member.role !== 'observer')
    .map((member) => member.userId)
  const actorId = hasRound ? nextActorId(participantIds, snapshot.actions) : null
  const actorName = actorId
    ? (snapshot.members.find((member) => member.userId === actorId)?.displayName ?? null)
    : null

  const hint = !hasRound
    ? d.room.observerNoRoundHint
    : actorName
      ? format(d.actionBar.notYourTurn, { name: actorName })
      : d.room.observerRoundSettling

  return (
    <Panel className="flex items-center justify-between gap-3 px-3! py-3!">
      <p className="font-bold">{d.room.observerStatusTitle}</p>
      <p className="min-w-0 text-end text-sm text-muted">{hint}</p>
    </Panel>
  )
}
