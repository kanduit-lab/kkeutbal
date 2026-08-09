'use client'

import { clsx } from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { HwatuCard } from '@/features/hwatu/types'
import { evaluateSeotdaHand } from '@/features/seotda/engine'
import type { SeotdaCategory, SeotdaTrait } from '@/features/seotda/types'
import { Badge, Button, Panel } from '@/components/ui'
import { format, useDict } from '@/lib/i18n/client'
import {
  SEOTDA_RANK_TABLE,
  SEOTDA_TOTAL_COMBOS,
  type SeotdaRankDetail,
  type SeotdaRankTier,
} from './seotda-rank-table'

type Dict = ReturnType<typeof useDict>['d']

/** 서열표에 섞여 있는 특수 능력과, 그 능력을 설명하는 유의사항 항목을 하나로 묶는다. */
const TRAIT_ORDER: readonly SeotdaTrait[] = ['amhaengeosa', 'ttaengjabi', 'gusa']

function traitLabel(trait: SeotdaTrait, d: Dict): string {
  if (trait === 'amhaengeosa') return d.advisor.ranking.traitAmhaengeosa
  if (trait === 'ttaengjabi') return d.advisor.ranking.traitTtaengjabi
  return d.advisor.ranking.traitGusa
}

function detailText(detail: SeotdaRankDetail, d: Dict, category: SeotdaCategory): string {
  const text =
    detail.kind === 'gwang'
      ? format(d.advisor.ranking.detailGwang, { a: detail.months[0], b: detail.months[1] })
      : detail.kind === 'pair'
        ? format(d.advisor.ranking.detailPair, { month: detail.month })
        : format(d.advisor.ranking.detailMonths, { a: detail.months[0], b: detail.months[1] })

  return category === 'kkeut'
    ? format(d.advisor.ranking.detailExamplePrefix, { detail: text })
    : text
}

export function SeotdaRankingPanel({ cards }: { cards: readonly HwatuCard[] }) {
  const { d } = useDict()
  const [caveatsOpen, setCaveatsOpen] = useState(false)
  const activeRowRef = useRef<HTMLDivElement | null>(null)

  const categoryLabel: Readonly<Record<SeotdaCategory, string>> = {
    gwangttaeng: d.advisor.ranking.categoryGwangttaeng,
    ttaeng: d.advisor.ranking.categoryTtaeng,
    special: d.advisor.ranking.categorySpecial,
    kkeut: d.advisor.ranking.categoryKkeut,
  }

  const hand = useMemo(() => {
    if (cards.length !== 2) return null
    try {
      return evaluateSeotdaHand([cards[0] as HwatuCard, cards[1] as HwatuCard])
    } catch {
      return null
    }
  }, [cards])
  const currentRank = hand?.rank ?? null
  // 내가 실제로 들고 있는 능력. 유의사항에서 이 항목을 맨 위로 끌어올려 강조한다 —
  // 4·7을 들고도 그게 광땡을 잡는 손인지 모르고 죽는 일이 이 화면이 막아야 할 일이다.
  const myTraits = useMemo(() => new Set(hand?.traits ?? []), [hand])

  const currentIndex = useMemo(
    () =>
      currentRank === null
        ? null
        : SEOTDA_RANK_TABLE.findIndex((tier) => tier.rank === currentRank),
    [currentRank],
  )
  const currentTier =
    currentIndex === null || currentIndex < 0 ? null : SEOTDA_RANK_TABLE[currentIndex]

  // 목록은 언제나 스크롤된다. 예전에는 현재 족보 둘레만 잘라 보여주고 위아래로 "N단계 더
  // 있어요"를 적었는데, 그 영역이 `overflow-hidden`이라 아무리 굴려도 움직이지 않았다 —
  // 29단계짜리 표에서 23단계가 남았다고 알려주면서 거기로 갈 방법을 주지 않은 셈이다.
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

  function renderRow(tier: SeotdaRankTier, index: number, ref?: React.Ref<HTMLDivElement>) {
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
          {/* 순위 번호를 줄마다 박아둔다. 예전에는 헤더에만 있어서 목록을 스크롤하는 동안
              지금 보고 있는 줄이 몇 위인지 알 수 없었다. */}
          <span
            className={clsx(
              'shrink-0 tabular-nums text-micro font-bold',
              isActive ? 'text-accent' : 'text-muted/60',
            )}
          >
            {format(d.advisor.ranking.positionBadge, { position: index + 1 })}
          </span>
          <Badge tone="muted">{categoryLabel[tier.category]}</Badge>
          {tier.traits.map(({ trait, combos }) => (
            <Badge key={trait} tone="warn">
              {tier.combos === combos
                ? traitLabel(trait, d)
                : format(d.advisor.ranking.traitCount, { trait: traitLabel(trait, d), n: combos })}
            </Badge>
          ))}
          {isActive ? (
            <span className="ms-auto shrink-0">
              <Badge tone="accent">{d.advisor.ranking.current}</Badge>
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span className={clsx('truncate text-sm font-bold', isActive && 'text-accent')}>
            {tier.label}
          </span>
          <span
            className="shrink-0 text-micro text-muted/70"
            title={format(d.advisor.ranking.combosAria, {
              n: tier.combos,
              total: SEOTDA_TOTAL_COMBOS,
            })}
          >
            {detailText(tier.detail, d, tier.category)}
            {' · '}
            <span className="tabular-nums">
              {format(d.advisor.ranking.combos, { n: tier.combos })}
            </span>
          </span>
        </div>
      </div>
    )
  }

  const caveats = <SeotdaCaveats myTraits={myTraits} />

  return (
    // 이 패널은 스스로 스크롤하지 않는다. 바깥 결과 컬럼(`ResultPane`)이 유일한 스크롤
    // 영역이라, 결과가 길어져도 순위표가 한 줄로 짜부라지지 않고 컬럼 전체가 같이 굴러간다.
    // 스크롤 영역을 겹쳐 두면 휠이 어느 쪽을 움직이는지도 예측할 수 없다.
    <Panel className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-muted">{d.advisor.ranking.title}</p>
          <p className="truncate text-xs text-muted/80">
            {currentTier
              ? format(d.advisor.ranking.currentPosition, {
                  label: currentTier.label,
                  position: (currentIndex ?? 0) + 1,
                  total: SEOTDA_RANK_TABLE.length,
                })
              : /* 바로 위 결과 패널이 이미 "카드 2장을 선택하세요"라고 말한다. 같은 지시를
                   두 번 쌓는 대신 이 표가 무엇인지를 적는다. */
                format(d.advisor.ranking.totalTiers, { total: SEOTDA_RANK_TABLE.length })}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          aria-expanded={caveatsOpen}
          onClick={() => setCaveatsOpen((current) => !current)}
        >
          {caveatsOpen ? d.advisor.ranking.caveatsToggleHide : d.advisor.ranking.caveatsToggleShow}
        </Button>
      </div>

      <div
        role="group"
        aria-label={caveatsOpen ? d.advisor.ranking.caveatsTitle : d.advisor.ranking.fullListAria}
      >
        {caveatsOpen ? (
          caveats
        ) : (
          <div className="space-y-1.5">
            {SEOTDA_RANK_TABLE.map((tier, index) =>
              renderRow(tier, index, tier.rank === currentRank ? activeRowRef : undefined),
            )}
          </div>
        )}
      </div>
    </Panel>
  )
}

/**
 * 순위표가 구조적으로 표현하지 못하는 규칙들. 서열은 한 줄로 세운 값인데 암행어사·땡잡이는
 * 그 줄을 뒤집고, 구사는 승패 자체를 지운다 — 표 안에 넣을 수 없어 따로 적는다.
 */
function SeotdaCaveats({ myTraits }: { myTraits: ReadonlySet<SeotdaTrait> }) {
  const { d } = useDict()
  const entries = [
    { key: 'amhaengeosa' as const, trait: 'amhaengeosa' as SeotdaTrait },
    { key: 'ttaengjabi' as const, trait: 'ttaengjabi' as SeotdaTrait },
    { key: 'gusa' as const, trait: 'gusa' as SeotdaTrait },
    { key: 'tie' as const, trait: null },
    { key: 'deck' as const, trait: null },
  ]
  // 내 패가 가진 능력을 위로 올린다. 순서는 TRAIT_ORDER로 고정해 매 렌더 같은 자리에 온다.
  const ordered = [...entries].sort((a, b) => {
    const aMine = a.trait && myTraits.has(a.trait) ? 0 : 1
    const bMine = b.trait && myTraits.has(b.trait) ? 0 : 1
    if (aMine !== bMine) return aMine - bMine
    return entries.indexOf(a) - entries.indexOf(b)
  })

  return (
    <ul className="space-y-2">
      {ordered.map(({ key, trait }) => {
        const isMine = trait !== null && myTraits.has(trait)
        const caveat = d.advisor.ranking.caveats[key]
        return (
          <li
            key={key}
            className={clsx(
              'rounded-xl px-3 py-2.5',
              isMine ? 'bg-accent/15 ring-1 ring-inset ring-accent/40' : 'bg-white/5',
            )}
          >
            <p className="flex items-center gap-1.5 text-sm font-bold">
              {isMine ? <Badge tone="accent">{d.advisor.ranking.current}</Badge> : null}
              <span className="min-w-0">{caveat.title}</span>
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              <Emphasized
                text={format(caveat.body, { total: SEOTDA_TOTAL_COMBOS })}
                strong={trait !== null && TRAIT_ORDER.includes(trait)}
              />
            </p>
          </li>
        )
      })}
    </ul>
  )
}

/** 본문의 `**...**` 구간만 굵게. 규칙 문장에서 예외 조건 한 조각만 강조하려고 쓴다. */
function Emphasized({ text, strong }: { text: string; strong: boolean }) {
  if (!strong || !text.includes('**')) return <>{text.replaceAll('**', '')}</>
  return (
    <>
      {text.split('**').map((part, index) =>
        index % 2 === 1 ? (
          <strong key={index} className="font-bold text-text">
            {part}
          </strong>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  )
}
