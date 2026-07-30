'use client'

import { useDict } from '@/lib/i18n/client'
import { Button } from '@/components/ui'
import type { SelfBlockReason } from './member-sheet-gating'
import { Section } from './member-sheet-parts'

/**
 * 자기 좌석을 탭했을 때의 최상단 액션 영역.
 * 베팅 UI를 여기 복제하지 않는다 — 이미 화면에 떠 있는 액션바(모바일 하단 고정 /
 * 데스크톱 테이블 아래 인라인)로 안내만 한다. 막혀 있으면 왜 막혔는지 설명한다.
 */
export function SelfBetNotice({
  reason,
  showDealerHint,
  onGoToActionBar,
}: {
  reason: SelfBlockReason | null
  showDealerHint: boolean
  onGoToActionBar: () => void
}) {
  const { d } = useDict()

  if (reason === null) {
    return (
      <Section icon="🎯" title={d.memberSheet.selfBetTitle}>
        <p className="text-sm text-muted">{d.memberSheet.selfBetReadyHint}</p>
        <Button variant="primary" className="w-full" onClick={onGoToActionBar}>
          {d.memberSheet.selfBetGoToActionBar}
        </Button>
      </Section>
    )
  }

  const message =
    reason === 'gostop'
      ? d.memberSheet.gostopNoBetting
      : reason === 'observerSelf'
        ? d.memberSheet.observerNoBetting
        : d.actionBar.noRound

  return (
    <Section icon="🎯" title={d.memberSheet.selfBetTitle}>
      <p className="text-sm text-muted">{message}</p>
      {reason === 'noRound' && showDealerHint ? (
        <p className="text-xs text-muted">{d.memberSheet.noRoundDealerHint}</p>
      ) : null}
    </Section>
  )
}
