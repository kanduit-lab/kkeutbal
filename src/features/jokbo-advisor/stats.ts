import { SEOTDA_DECK } from '@/features/hwatu/cards'
import type { HwatuCard } from '@/features/hwatu/types'
import { evaluateSeotdaHand, resolveSeotdaShowdown } from '@/features/seotda/engine'
import { SEOTDA_RULES_STANDARD, type SeotdaHand, type SeotdaTrait } from '@/features/seotda/types'
import { catcherTraitAgainst, seotdaAdvice, type SeotdaAdviceCode } from '@/features/seotda/advice'
import type { PokerCategory } from '@/features/poker/engine'

/** 섯다 20장 전체 190조합. 모듈 로드 시 1회 계산. */
const ALL_SEOTDA_HANDS: readonly SeotdaHand[] = (() => {
  const hands: SeotdaHand[] = []
  for (let i = 0; i < SEOTDA_DECK.length; i += 1) {
    for (let j = i + 1; j < SEOTDA_DECK.length; j += 1) {
      hands.push(
        evaluateSeotdaHand([SEOTDA_DECK[i] as HwatuCard, SEOTDA_DECK[j] as HwatuCard]),
      )
    }
  }
  return hands
})()

/** 서열 단계: 높은 rank 부터. */
const SEOTDA_TIERS: readonly number[] = [...new Set(ALL_SEOTDA_HANDS.map((hand) => hand.rank))].sort(
  (a, b) => b - a,
)

export interface SeotdaStats {
  /** 전체 서열 단계 수 */
  readonly totalTiers: number
  /** 이 패의 서열 순위 (1 = 최강) */
  readonly tierPosition: number
  /** 같은 서열인 조합 수 (본인 포함, 190조합 기준) */
  readonly sameTierCount: number
  /** 남은 18장에서 상대 한 명이 받을 153조합 대비 */
  readonly winRate: number
  readonly loseRate: number
  readonly replayRate: number
  /** 이 패에 붙는 상황 안내 코드 — 문구는 사전이 갖는다. */
  readonly advice: readonly SeotdaAdviceCode[]
  /** 내 패를 잡을 수 있는 상대 판정패. 없으면 null. */
  readonly catcherTrait: SeotdaTrait | null
  /** 상대 153조합 중 그 잡는 패가 나올 비율. catcherTrait 이 없으면 0. */
  readonly catcherRate: number
}

export function seotdaStats(hand: SeotdaHand): SeotdaStats {
  const tierPosition = SEOTDA_TIERS.indexOf(hand.rank) + 1
  const sameTierCount = ALL_SEOTDA_HANDS.filter((other) => other.rank === hand.rank).length

  const myIds = new Set(hand.cards.map((card) => card.id))
  const remaining = SEOTDA_DECK.filter((card) => !myIds.has(card.id))

  const catcherTrait = catcherTraitAgainst(hand, SEOTDA_RULES_STANDARD)

  let wins = 0
  let losses = 0
  let replays = 0
  let catchers = 0
  let total = 0
  for (let i = 0; i < remaining.length; i += 1) {
    for (let j = i + 1; j < remaining.length; j += 1) {
      const opponent = evaluateSeotdaHand([
        remaining[i] as HwatuCard,
        remaining[j] as HwatuCard,
      ])
      const outcome = resolveSeotdaShowdown([hand, opponent], SEOTDA_RULES_STANDARD)
      total += 1
      if (catcherTrait && opponent.traits.includes(catcherTrait)) catchers += 1
      if (outcome.kind === 'win') {
        if (outcome.winnerIndex === 0) wins += 1
        else losses += 1
      } else {
        // replay(구사·동급 재경기)와 tie 는 승부 없음으로 묶는다
        replays += 1
      }
    }
  }

  return {
    totalTiers: SEOTDA_TIERS.length,
    tierPosition,
    sameTierCount,
    winRate: wins / total,
    loseRate: losses / total,
    replayRate: replays / total,
    advice: seotdaAdvice(hand, SEOTDA_RULES_STANDARD),
    catcherTrait,
    catcherRate: catcherTrait ? catchers / total : 0,
  }
}

/** 5장 무작위 기준 등장 확률(%). 표준 포커 확률표. */
export const POKER_CATEGORY_STATS: Record<
  PokerCategory,
  { readonly position: number; readonly probability: number }
> = {
  'royal-flush': { position: 1, probability: 0.000154 },
  'straight-flush': { position: 2, probability: 0.00139 },
  'four-of-a-kind': { position: 3, probability: 0.024 },
  'full-house': { position: 4, probability: 0.1441 },
  flush: { position: 5, probability: 0.1965 },
  straight: { position: 6, probability: 0.3925 },
  'three-of-a-kind': { position: 7, probability: 2.1128 },
  'two-pair': { position: 8, probability: 4.7539 },
  'one-pair': { position: 9, probability: 42.2569 },
  'high-card': { position: 10, probability: 50.1177 },
}
