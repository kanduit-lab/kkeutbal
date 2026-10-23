'use client'

import { clsx } from 'clsx'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Button, Panel, useToast } from '@/components/ui'
import { findCard } from '@/features/hwatu/cards'
import { HwatuCardView } from '@/features/hwatu/components/hwatu-card'
import { getMyVerifiedSeotdaHand } from '@/features/fairness/fairness-actions'
import { seotdaPairsOf, toThreeCardHand } from '@/features/seotda/three-card'
import { format, translateError, useDict } from '@/lib/i18n/client'
import { settleDueHandChoices, submitHandChoice } from '../hand-choice-actions'
import type { RoomSnapshot } from '../types'
import { lastAcceptedByUser, type BroadcastSpec, type RunAction } from './shared'

function roundEndedBroadcast(
  roundId: string,
  data: { roundEnded?: { seq: number; pot: number; winnerId: string } },
): BroadcastSpec | void {
  if (!data.roundEnded) return
  return {
    event: 'round.ended',
    payload: {
      roundId,
      seq: data.roundEnded.seq,
      winnerId: data.roundEnded.winnerId,
      pot: data.roundEnded.pot,
    },
  }
}

/** 3장 섯다 검증 딜 방에서 2차 베팅이 끝난 뒤 승부할 두 장을 고르는 단계 */
export function HandChoicePanel({
  snapshot,
  selfId,
  runAction,
  staleReason = null,
}: {
  snapshot: RoomSnapshot
  selfId: string
  runAction: RunAction
  staleReason?: string | null
}) {
  const { d } = useDict()
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [cardIds, setCardIds] = useState<readonly string[] | null>(null)
  const [chosenIds, setChosenIds] = useState<readonly string[] | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const settledFor = useRef<string | null>(null)

  const round = snapshot.currentRound
  const roundId = round?.id
  const deadline = round?.chooseDeadline ? new Date(round.chooseDeadline).getTime() : null
  const contenderIds = useMemo(() => {
    if (!round) return []
    const last = lastAcceptedByUser(snapshot.actions)
    return round.participantUserIds.filter((userId) => last.get(userId)?.action !== 'fold')
  }, [round, snapshot.actions])
  const isContender = contenderIds.includes(selfId)

  useEffect(() => {
    if (deadline === null) return
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [deadline])

  useEffect(() => {
    if (!roundId || deadline === null || !isContender) return
    let cancelled = false
    void getMyVerifiedSeotdaHand(snapshot.room.id, roundId).then((result) => {
      if (cancelled) return
      if (!result.success) {
        toast(translateError(d, result.error), 'error')
        return
      }
      setCardIds(result.data.cards.map((card) => card.id))
      setChosenIds(result.data.chosenCardIds)
    })
    return () => {
      cancelled = true
    }
  }, [roundId, deadline, isContender, snapshot.room.id, d, toast])

  const pairs = useMemo(() => {
    const cards = toThreeCardHand(
      (cardIds ?? []).flatMap((id) => {
        const card = findCard(id)
        return card ? [card] : []
      }),
    )
    return cards ? seotdaPairsOf(cards) : []
  }, [cardIds])
  const bestIndex = pairs.reduce(
    (best, pair, index) => (best < 0 || pair.rank > (pairs[best]?.rank ?? 0) ? index : best),
    -1,
  )

  const deadlinePassed = deadline !== null && now >= deadline
  useEffect(() => {
    if (!roundId || !deadlinePassed || settledFor.current === roundId) return
    settledFor.current = roundId
    void runAction(
      () => settleDueHandChoices(snapshot.room.id),
      (data) => roundEndedBroadcast(roundId, data),
    )
  }, [roundId, deadlinePassed, runAction, snapshot.room.id])

  if (!round || deadline === null) return null

  const secondsLeft = Math.max(0, Math.ceil((deadline - now) / 1000))
  const chosenCount = round.choiceUserIds.length
  const selectedIndex = picked ?? bestIndex
  const chosenPair = chosenIds
    ? pairs.find((pair) => pair.cards.every((card) => chosenIds.includes(card.id)))
    : undefined

  const submit = () => {
    const pair = pairs[selectedIndex]
    if (!pair || chosenIds || isPending) return
    const ids = pair.cards.map((card) => card.id)
    startTransition(async () => {
      const success = await runAction(
        () => submitHandChoice({ roomId: snapshot.room.id, roundId: round.id, cardIds: ids }),
        (data) => roundEndedBroadcast(round.id, data),
      )
      if (success) setChosenIds(ids)
    })
  }

  return (
    <Panel className="mb-3 space-y-3 border border-gold/30 bg-gold/5 px-3! py-3!">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-gold">{d.fairness.chooseTitle}</h2>
        <span className="text-xs font-bold tabular-nums text-muted" aria-live="polite">
          {format(d.fairness.deadlineIn, { n: secondsLeft })}
        </span>
      </div>
      <p className="text-xs text-muted">
        {format(d.fairness.chooseProgress, { chosen: chosenCount, total: contenderIds.length })}
      </p>
      {isContender && chosenIds ? (
        <p className="text-sm font-bold">
          {format(d.fairness.chooseWaiting, { hand: chosenPair?.label ?? '' })}
        </p>
      ) : null}
      {isContender && !chosenIds && pairs.length === 3 ? (
        <>
          <div role="radiogroup" aria-label={d.fairness.chooseTitle} className="grid gap-2">
            {pairs.map((pair, index) => (
              <button
                key={pair.cards.map((card) => card.id).join('+')}
                type="button"
                role="radio"
                aria-checked={index === selectedIndex}
                aria-label={format(d.fairness.choosePairAria, {
                  cards: pair.cards.map((card) => card.label).join(' + '),
                  hand: pair.label,
                })}
                disabled={isPending}
                onClick={() => setPicked(index)}
                className={clsx(
                  'flex items-center gap-3 rounded-xl px-3 py-2 text-left transition',
                  index === selectedIndex ? 'bg-gold/15 ring-2 ring-gold' : 'bg-inset',
                )}
              >
                <span className="flex w-20 shrink-0 gap-1">
                  {pair.cards.map((card) => (
                    <HwatuCardView key={card.id} card={card} size="sm" />
                  ))}
                </span>
                <span className="min-w-0 flex-1 font-black">{pair.label}</span>
                {index === bestIndex ? (
                  <span className="rounded bg-gold/20 px-1.5 text-xs font-bold text-gold">
                    {d.fairness.chooseBest}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">{d.fairness.chooseHint}</p>
          <Button
            type="button"
            className="w-full"
            loading={isPending}
            loadingLabel={d.ui.processing}
            disabled={isPending || deadlinePassed || staleReason !== null}
            disabledReason={staleReason ?? undefined}
            onClick={submit}
          >
            {d.fairness.chooseSubmit}
          </Button>
        </>
      ) : null}
    </Panel>
  )
}
