'use client'

import { clsx } from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PokerCard } from '@/features/poker/cards'
import { evaluatePokerHand } from '@/features/poker/engine'
import { Badge, Button, Panel } from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'
import { POKER_RANK_TABLE, type PokerRankTier } from './poker-rank-table'

export function PokerRankingPanel({ cards }: { cards: readonly PokerCard[] }) {
  const { d } = useDict()
  const [caveatsOpen, setCaveatsOpen] = useState(false)
  const activeRowRef = useRef<HTMLDivElement | null>(null)

  const currentRank = useMemo(() => {
    if (cards.length === 0) return null
    try {
      const evaluated =
        cards.length < 5
          ? null
          : POKER_RANK_TABLE.find((tier) => tier.category === evaluatePokerHand(cards).category)
      return evaluated?.rank ?? null
    } catch {
      return null
    }
  }, [cards])

  const currentIndex = useMemo(
    () =>
      currentRank === null ? null : POKER_RANK_TABLE.findIndex((tier) => tier.rank === currentRank),
    [currentRank],
  )
  const currentTier =
    currentIndex === null || currentIndex < 0 ? null : POKER_RANK_TABLE[currentIndex]

  // 섯다 쪽과 같은 이유로 목록은 언제나 스크롤된다 — 잘라 보여주고 "N단계 더 있어요"만
  // 적어 두면 거기로 갈 방법이 없다. 자세한 근거는 `seotda-ranking-panel.tsx`.
  useEffect(() => {
    if (!currentTier) return
    const reduceMotion =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const frame = window.requestAnimationFrame(() => {
      activeRowRef.current?.scrollIntoView?.({
        block: 'center',
        behavior: reduceMotion ? 'auto' : 'smooth',
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [currentTier, caveatsOpen])

  function renderRow(tier: PokerRankTier, index: number, ref?: React.Ref<HTMLDivElement>) {
    const isActive = tier.rank === currentRank
    return (
      <div
        key={tier.rank}
        ref={ref}
        aria-current={isActive ? 'true' : undefined}
        className={clsx(
          'rounded-xl px-3 py-2',
          isActive ? 'bg-accent/20 ring-1 ring-inset ring-accent/50' : 'bg-white/5',
        )}
      >
        <div className="flex items-center gap-1.5">
          {/* 줄마다 순위 번호를 둔다 — 목록을 스크롤할 때 헤더의 "N위"는 화면 밖으로 나간다. */}
          <span
            className={clsx(
              'shrink-0 tabular-nums text-micro font-bold',
              isActive ? 'text-accent' : 'text-muted/60',
            )}
          >
            {format(d.advisor.pokerRanking.positionBadge, { position: index + 1 })}
          </span>
          <span className={clsx('truncate text-sm font-bold', isActive && 'text-accent')}>
            {tier.label}
          </span>
          {isActive ? (
            <span className="ms-auto shrink-0">
              <Badge tone="accent">{d.advisor.pokerRanking.current}</Badge>
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted/70">
          {d.advisor.pokerRanking.description[tier.descriptionKey]}
        </p>
      </div>
    )
  }

  const caveats = (
    <ul className="space-y-2">
      {(['bestFive', 'wheel', 'kicker', 'suit'] as const).map((key) => {
        const caveat = d.advisor.pokerRanking.caveats[key]
        return (
          <li key={key} className="rounded-xl bg-white/5 px-3 py-2.5">
            <p className="text-sm font-bold">{caveat.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {caveat.body.replaceAll('**', '')}
            </p>
          </li>
        )
      })}
    </ul>
  )

  return (
    // 섯다 쪽과 같이 스스로 스크롤하지 않는다 — 바깥 결과 컬럼이 유일한 스크롤 영역이다.
    <Panel className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-muted">{d.advisor.pokerRanking.title}</p>
          <p className="truncate text-xs text-muted/80">
            {currentTier
              ? format(d.advisor.pokerRanking.currentPosition, {
                  label: currentTier.label,
                  position: (currentIndex ?? 0) + 1,
                  total: POKER_RANK_TABLE.length,
                })
              : format(d.advisor.pokerRanking.totalTiers, { total: POKER_RANK_TABLE.length })}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          aria-expanded={caveatsOpen}
          onClick={() => setCaveatsOpen((current) => !current)}
        >
          {caveatsOpen
            ? d.advisor.pokerRanking.caveatsToggleHide
            : d.advisor.pokerRanking.caveatsToggleShow}
        </Button>
      </div>

      <div
        role="group"
        aria-label={
          caveatsOpen ? d.advisor.pokerRanking.caveatsTitle : d.advisor.pokerRanking.fullListAria
        }
      >
        {caveatsOpen ? (
          caveats
        ) : (
          <div className="space-y-1.5">
            {POKER_RANK_TABLE.map((tier, index) =>
              renderRow(tier, index, tier.rank === currentRank ? activeRowRef : undefined),
            )}
          </div>
        )}
      </div>
    </Panel>
  )
}
