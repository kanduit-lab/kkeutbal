import { SEOTDA_DECK } from '@/features/hwatu/cards'
import type { HwatuCard } from '@/features/hwatu/types'
import { evaluateSeotdaHand } from '@/features/seotda/engine'
import type { SeotdaCategory } from '@/features/seotda/types'

/**
 * 섯다 족보 전체 서열표 — 20장 덱의 190조합을 실제로 판정해 rank 별 대표 라벨을 하나씩만
 * 남긴다. 순위·라벨은 seotda/engine.ts(evaluateSeotdaHand) 가 유일한 source of truth이고,
 * 이 모듈은 그 결과를 그대로 옮겨 적을 뿐이다 — 순위 값이나 라벨 문자열을 여기서 재정의하지
 * 않는다. jokbo-advisor/stats.ts 의 ALL_SEOTDA_HANDS/SEOTDA_TIERS 와 같은 방식이다.
 */
export interface SeotdaRankTier {
  readonly rank: number
  readonly label: string
  readonly category: SeotdaCategory
}

function buildRankTable(): readonly SeotdaRankTier[] {
  // 로컬 accumulator — 함수 밖으로 새지 않음
  const seen = new Map<number, SeotdaRankTier>()
  for (let i = 0; i < SEOTDA_DECK.length; i += 1) {
    for (let j = i + 1; j < SEOTDA_DECK.length; j += 1) {
      const hand = evaluateSeotdaHand([SEOTDA_DECK[i] as HwatuCard, SEOTDA_DECK[j] as HwatuCard])
      if (!seen.has(hand.rank)) {
        seen.set(hand.rank, { rank: hand.rank, label: hand.label, category: hand.category })
      }
    }
  }
  return [...seen.values()].sort((a, b) => b.rank - a.rank)
}

/** 높은 순 29단계 (광땡 3 · 땡 10 · 특수 6 · 끗 10). 모듈 로드 시 1회 계산. */
export const SEOTDA_RANK_TABLE: readonly SeotdaRankTier[] = buildRankTable()
