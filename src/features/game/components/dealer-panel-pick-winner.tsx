'use client'

import { format, useDict } from '@/lib/i18n/client'
import { Button, Input } from '@/components/ui'
import type { MemberView, RoundView } from '../types'
import { GostopScoreForm, type GostopScoreState } from './gostop-score-form'
import type { DealerSlot } from './dealer-panel-controls'

/**
 * 승자 선택 + (고스톱이면) 점수 입력 + 메모 폼. 데스크톱 `DealerPanel`은 Panel
 * 안에, 모바일 `DealerToolsSheet`는 Sheet 안에 그대로 얹는다 — 판정 규칙과
 * 마크업을 두 곳에서 따로 유지하지 않기 위해 분리했다.
 */
export function DealerPickWinnerForm({
  round,
  isGostop,
  eligiblePlayers,
  foldWinWinner,
  winnerId,
  setWinnerId,
  gostop,
  setGostop,
  gostopLosers,
  pointValue,
  note,
  setNote,
  noteExample,
  selectedWinnerIsEligible,
  isPending,
  firingSlot,
  staleReason = null,
  onCancel,
  onConfirm,
  onReplay,
}: {
  round: RoundView
  isGostop: boolean
  eligiblePlayers: readonly MemberView[]
  foldWinWinner: MemberView | null
  winnerId: string | null
  setWinnerId: (userId: string) => void
  gostop: GostopScoreState
  setGostop: (next: GostopScoreState) => void
  gostopLosers: readonly MemberView[]
  pointValue: number
  note: string
  setNote: (note: string) => void
  noteExample: string
  selectedWinnerIsEligible: boolean
  isPending: boolean
  firingSlot: DealerSlot | null
  staleReason?: string | null
  onCancel: () => void
  onConfirm: () => void
  /**
   * 승부가 안 나 승자를 고를 수 없을 때(섯다 구사·무승부, 고스톱 나가리) 무효화(재경기)로
   * 빠지는 경로. 이 폼이 떠 있는 동안에는 딜러 컨트롤의 "판 무효" 버튼이 화면에서 사라지므로
   * (데스크톱은 버튼 그리드가 폼으로 교체되고, 모바일은 퀵바가 시트에 가린다) 여기 없으면
   * 딜러가 폼을 먼저 닫는 방법을 스스로 찾아내야 한다.
   */
  onReplay?: () => void
}) {
  const { d } = useDict()
  return (
    <div className="space-y-2.5">
      <p className="text-sm font-medium">
        {format(d.dealer.pickWinner, { seq: round.seq })}
        {isGostop ? null : (
          <>
            {` · ${d.dealer.potLabel} `}
            <span className="tabular-nums font-bold text-warn">{round.pot.toLocaleString()}</span>
          </>
        )}
      </p>
      {foldWinWinner ? (
        <p className="rounded-md border border-win/30 bg-win/10 px-3 py-2 text-xs text-win">
          {format(d.dealer.foldWinHint, { winner: foldWinWinner.displayName })}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        {eligiblePlayers.map((member) => (
          <Button
            key={member.userId}
            variant={winnerId === member.userId ? 'win' : 'outline'}
            pressed={winnerId === member.userId}
            className="max-w-full"
            onClick={() => setWinnerId(member.userId)}
          >
            <span className="truncate">{member.displayName}</span>
          </Button>
        ))}
      </div>
      {isGostop ? (
        <GostopScoreForm
          state={gostop}
          onChange={setGostop}
          losers={gostopLosers}
          pointValue={pointValue}
        />
      ) : null}
      <Input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={format(d.dealer.notePlaceholder, { example: noteExample })}
        maxLength={60}
      />
      {onReplay ? (
        <Button
          variant="outline"
          className="w-full"
          disabled={isPending || staleReason !== null}
          disabledReason={staleReason ?? undefined}
          onClick={onReplay}
        >
          {d.dealer.voidAsReplay}
        </Button>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" disabled={isPending} onClick={onCancel}>
          {d.common.cancel}
        </Button>
        <Button
          variant="win"
          size="lg"
          loading={firingSlot === 'confirmWinner'}
          loadingLabel={d.ui.processing}
          disabled={isPending || !selectedWinnerIsEligible || staleReason !== null}
          disabledReason={
            !selectedWinnerIsEligible ? d.dealer.pickWinnerFirst : (staleReason ?? undefined)
          }
          onClick={onConfirm}
        >
          {d.dealer.confirmWinner}
        </Button>
      </div>
    </div>
  )
}
