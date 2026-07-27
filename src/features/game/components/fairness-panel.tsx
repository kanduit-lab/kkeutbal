'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
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
/** 진행 표시를 붙일 버튼 자리. */
type FairnessSlot = 'submit' | 'seal' | 'reveal'

export function FairnessPanel({
  snapshot,
  selfId,
  runAction,
  staleReason = null,
}: {
  snapshot: RoomSnapshot
  selfId: string
  runAction: RunAction
  /** 스냅샷이 낡아 조작을 잠글 사유. null 이면 정상. */
  staleReason?: string | null
}) {
  const { d, locale } = useDict()
  const { toast } = useToast()
  const [clientSeed, setClientSeed] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [handCardIds, setHandCardIds] = useState<readonly string[] | null>(null)
  const [isPending, startTransition] = useTransition()
  /** 현재 요청이 걸린 버튼 자리 — 세 버튼이 한꺼번에 도는 대신 누른 버튼만 돌게 한다. */
  const [firingSlot, setFiringSlot] = useState<FairnessSlot | null>(null)

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

  /** 마감까지 남은 초 — 이미 1초마다 리렌더하고 있으니 절대 시각 대신 카운트다운을 보여준다. */
  const secondsLeft = deadline
    ? Math.max(0, Math.ceil((deadline.getTime() - now) / 1000))
    : null

  if (!round || !fairness) return null

  /**
   * 세 액션 모두 useTransition 으로 감싼다. 원래는 아무 진행 표시·중복 차단이 없어서
   * 시드 수집 창(10~120초)이라는 시간 압박 구간에서 연타가 그대로 중복 요청이 됐다.
   */
  const runSlot = (slot: FairnessSlot, task: () => Promise<unknown>) => {
    if (isPending) return
    setFiringSlot(slot)
    startTransition(async () => {
      try {
        await task()
      } finally {
        setFiringSlot(null)
      }
    })
  }

  const submit = () => {
    if (!clientSeed || submitted) return
    runSlot('submit', () =>
      runAction(
        () => submitFairnessSeed({ roomId: snapshot.room.id, roundId: round.id, clientSeed }),
        () => {
          setSubmitted(true)
        },
      ),
    )
  }

  /**
   * 내 패는 토글이다. 한 번 열면 다시 못 닫히던 동작은, 폰을 테이블에 내려놓는 게임에서
   * 상대에게 내 패를 그대로 보여주는 것과 같다 — 공정 딜 모드에서 가장 나쁜 결과다.
   */
  const toggleHand = () => {
    if (handCardIds) {
      setHandCardIds(null)
      return
    }
    runSlot('reveal', async () => {
      const result = await getMyVerifiedSeotdaHand(snapshot.room.id, round.id)
      if (!result.success) {
        toast(translateError(d, result.error), 'error')
        return
      }
      setHandCardIds(result.data.cards.map((card) => card.id))
    })
  }

  const copyCommitment = async () => {
    try {
      await navigator.clipboard.writeText(fairness.serverSeedCommitment)
      toast(d.fairness.commitmentCopied, 'success')
    } catch {
      toast(d.fairness.copyFailed, 'error')
    }
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
        {deadline ? (
          <p aria-live="polite">
            {secondsLeft !== null && !deadlineReached
              ? format(d.fairness.deadlineIn, { n: secondsLeft })
              : format(d.fairness.deadline, { time: deadline.toLocaleTimeString(locale) })}
          </p>
        ) : null}
        {/*
          commitment 는 의심하는 사람이 눈으로 대조하라고 있는 값이다. 10px + opacity-70
          은 제품에서 가장 안 읽히는 글자였다 — 대비를 살리고 복사 버튼을 붙인다.
        */}
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 break-all font-mono text-micro text-muted">
            <span className="sr-only">{d.fairness.commitmentLabel}: </span>
            {fairness.serverSeedCommitment}
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="shrink-0"
            aria-label={d.fairness.copyCommitment}
            title={d.fairness.copyCommitment}
            onClick={() => void copyCommitment()}
          >
            📋
          </Button>
        </div>
      </div>

      {fairness.phase === 'collecting_seeds' && isParticipant ? (
        <div className="space-y-2">
          <p className="text-xs text-muted">{d.fairness.seedReady}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={submitted ? 'surface' : 'primary'}
              loading={firingSlot === 'submit'}
              loadingLabel={d.ui.processing}
              disabled={isPending || !clientSeed || submitted || staleReason !== null}
              disabledReason={staleReason ?? undefined}
              onClick={submit}
            >
              {submitted ? d.fairness.seedSubmitted : d.fairness.submitSeed}
            </Button>
            <Button
              type="button"
              variant="outline"
              loading={firingSlot === 'seal'}
              loadingLabel={d.ui.processing}
              disabled={!canSeal || isPending || staleReason !== null}
              disabledReason={
                !canSeal ? d.fairness.waitForSeeds : (staleReason ?? undefined)
              }
              onClick={() =>
                runSlot('seal', () =>
                  runAction(() => sealFairnessRound(snapshot.room.id, round.id)),
                )
              }
            >
              {d.fairness.sealDeal}
            </Button>
          </div>
        </div>
      ) : null}

      {fairness.phase === 'sealed' && isParticipant ? (
        <div className="space-y-2">
          <p className="text-xs text-muted">{d.fairness.dealerWillResolve}</p>
          <Button
            type="button"
            variant={handCardIds ? 'outline' : 'primary'}
            className="w-full"
            loading={firingSlot === 'reveal'}
            loadingLabel={d.ui.processing}
            disabled={isPending}
            pressed={handCardIds !== null}
            onClick={toggleHand}
          >
            {handCardIds ? d.fairness.hideMyHand : d.fairness.showMyHand}
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
