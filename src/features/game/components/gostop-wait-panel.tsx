'use client'

import { Alert } from '@/components/ui'
import { useDict } from '@/lib/i18n/client'

/**
 * 고스톱 비딜러용 대기 표면. 섯다·포커의 `actionBar.noRound`처럼 "지금 누가
 * 무엇을 하는 중인지"를 알려준다. 고스톱은 베팅이 없어 ActionBar가 아예 뜨지
 * 않으므로(room-client.tsx의 `canBet`이 항상 false) 이 패널이 유일한 안내다.
 *
 * `hasRound`는 room-client.tsx가 `Boolean(snapshot.currentRound)`를 넘겨줘야
 * 의미가 생긴다. 지금 호출부(`<GostopWaitPanel />`)는 인자 없이 호출하고
 * `showGostopWait` 자체가 `Boolean(snapshot.currentRound)`일 때만 이 컴포넌트를
 * 렌더링하므로, 기본값 true는 현재 동작을 그대로 보존한다 — 판 종료 후
 * 다음 판 시작 전(currentRound === null) 구간은 room-client.tsx의 게이트 조건이
 * 바뀌기 전까지는 여전히 이 컴포넌트가 렌더링되지 않는다. 무엇이 필요한지는
 * PR/작업 보고 참고.
 */
export function GostopWaitPanel({ hasRound = true }: { hasRound?: boolean } = {}) {
  const { d } = useDict()

  const title = hasRound ? d.room.gostopWaitTitle : d.room.gostopWaitNextRoundTitle
  const hint = hasRound ? d.room.gostopWaitHint : d.room.gostopWaitNextRoundHint

  return (
    <Alert tone="info" title={title} className="rounded-2xl! px-3!">
      {hint}
    </Alert>
  )
}
