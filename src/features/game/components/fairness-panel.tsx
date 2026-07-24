'use client'

import { useEffect, useMemo, useState } from 'react'
import { HwatuCardView } from '@/components/hwatu-card'
import { Button, Panel, useToast } from '@/components/ui'
import { findCard } from '@/features/hwatu/cards'
import {
  getMyVerifiedSeotdaHand,
  sealFairnessRound,
  submitFairnessSeed,
} from '@/features/fairness/fairness-actions'
import { generateFairnessSeed } from '@/features/fairness/protocol'
import { format, translateError, useDict } from '@/lib/i18n/client'
import type { RoomSnapshot } from '../types'
import type { RunAction } from './shared'

/** The original client seed never enters a room snapshot or realtime event; it stays in session storage. */
function clientSeedStorageKey(roundId: string): string {
  return `kkeutbal/fairness/client-seed/${roundId}`
}

function validSeed(value: string | null): value is string {
  return value !== null && /^[0-9a-f]{64}$/i.test(value)
}

/**
 * Private-hand and commit controls for an active verified Seotda round.
 * This component deliberately receives only the public fairness view from the room snapshot.
 */
export function FairnessPanel({
  snapshot,
  selfId,
  runAction,
}: {
  snapshot: RoomSnapshot
  selfId: string
  runAction: RunAction
}) {
  const { d, locale } = useDict()
  const { toast } = useToast()
  const [clientSeed, setClientSeed] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [handCardIds, setHandCardIds] = useState<readonly string[] | null>(null)

  const round = snapshot.currentRound
  const fairness = round?.fairness
  const roundId = round?.id
  const fairPhase = fairness?.phase
  const isParticipant = fairness?.participantUserIds.includes(selfId) ?? false
  const hasSubmittedSeed = fairness?.submittedParticipantUserIds.includes(selfId) ?? false

  useEffect(() => {
    if (!roundId || fairPhase !== 'collecting_seeds') {
      setClientSeed(null)
      setSubmitted(false)
      return
    }
    if (!isParticipant) {
      setClientSeed(null)
      setSubmitted(false)
      return
    }
    const key = clientSeedStorageKey(roundId)
    const saved = window.sessionStorage.getItem(key)
    if (hasSubmittedSeed) {
      setClientSeed(validSeed(saved) ? saved.toLowerCase() : null)
      setSubmitted(true)
      setHandCardIds(null)
      return
    }
    const nextSeed = validSeed(saved) ? saved.toLowerCase() : generateFairnessSeed()
    if (!validSeed(saved)) window.sessionStorage.setItem(key, nextSeed)
    setClientSeed(nextSeed)
    setSubmitted(false)
    setHandCardIds(null)
  }, [roundId, fairPhase, hasSubmittedSeed, isParticipant])

  useEffect(() => {
    if (fairPhase !== 'collecting_seeds') return
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [fairPhase])

  const deadline = fairness ? new Date(fairness.seedDeadline) : null
  const deadlineReached = deadline ? now >= deadline.getTime() : false
  const canSeal = Boolean(
    fairness &&
      isParticipant &&
      fairness.phase === 'collecting_seeds' &&
      (deadlineReached || fairness.submittedParticipantCount === fairness.participantCount),
  )
  const handCards = useMemo(
    () => (handCardIds ?? []).flatMap((id) => {
      const card = findCard(id)
      return card && card.seotda ? [card] : []
    }),
    [handCardIds],
  )

  if (!round || !fairness) return null

  const submit = () => {
    if (!clientSeed || submitted) return
    void runAction(
      () => submitFairnessSeed({ roomId: snapshot.room.id, roundId: round.id, clientSeed }),
      () => {
        setSubmitted(true)
      },
    )
  }

  const revealHand = async () => {
    const result = await getMyVerifiedSeotdaHand(snapshot.room.id, round.id)
    if (!result.success) {
      toast(translateError(d, result.error), 'error')
      return
    }
    setHandCardIds(result.data.cards.map((card) => card.id))
  }

  return (
    <Panel className="mb-4 space-y-3 border border-accent/30 bg-accent/5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-accent">🔐 {d.fairness.title}</h2>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold text-muted">
          {fairness.phase === 'collecting_seeds' ? d.fairness.collecting : d.fairness.sealed}
        </span>
      </div>

      <div className="space-y-1 text-xs text-muted">
        <p>{format(d.fairness.submitted, { submitted: fairness.submittedParticipantCount, total: fairness.participantCount })}</p>
        {deadline ? <p>{format(d.fairness.deadline, { time: deadline.toLocaleTimeString(locale) })}</p> : null}
        <p className="break-all font-mono text-[10px] opacity-70">{fairness.serverSeedCommitment}</p>
      </div>

      {fairness.phase === 'collecting_seeds' && isParticipant ? (
        <div className="space-y-2">
          <p className="text-xs text-muted">{d.fairness.seedReady}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={submitted ? 'surface' : 'primary'}
              disabled={!clientSeed || submitted}
              onClick={submit}
            >
              {submitted ? d.fairness.seedSubmitted : d.fairness.submitSeed}
            </Button>
            <Button
              type="button"
              variant="surface"
              className="border border-white/10"
              disabled={!canSeal}
              disabledReason={!canSeal ? d.fairness.waitForSeeds : undefined}
              onClick={() => void runAction(() => sealFairnessRound(snapshot.room.id, round.id))}
            >
              {d.fairness.sealDeal}
            </Button>
          </div>
        </div>
      ) : null}

      {fairness.phase === 'sealed' && isParticipant ? (
        <div className="space-y-2">
          <p className="text-xs text-muted">{d.fairness.dealerWillResolve}</p>
          <Button type="button" variant="primary" className="w-full" onClick={() => void revealHand()}>
            {d.fairness.showMyHand}
          </Button>
          {handCards.length === 2 ? (
            <div>
              <p className="mb-1 text-xs font-bold text-muted">{d.fairness.handTitle}</p>
              <div className="flex gap-2">
                {handCards.map((card) => (
                  <HwatuCardView key={card.id} card={card} size="sm" />
                ))}
              </div>
            </div>
          ) : null}
          <p className="text-xs text-muted">{d.fairness.replayHint}</p>
        </div>
      ) : null}
    </Panel>
  )
}
