import { SEOTDA_DECK } from '@/features/hwatu/cards'
import type { HwatuCard } from '@/features/hwatu/types'
import { evaluateSeotdaHand } from '@/features/seotda/engine'
import type { SeotdaCategory, SeotdaTrait } from '@/features/seotda/types'

export type SeotdaRankDetail =
  | { readonly kind: 'gwang'; readonly months: readonly [number, number] }
  | { readonly kind: 'pair'; readonly month: number }
  | { readonly kind: 'months'; readonly months: readonly [number, number] }

/** 이 서열에 속한 조합 중 특수 능력(암행어사·땡잡이·구사)을 가진 것이 몇 가지인지. */
export interface SeotdaRankTierTrait {
  readonly trait: SeotdaTrait
  readonly combos: number
}

export interface SeotdaRankTier {
  readonly rank: number
  readonly label: string
  readonly category: SeotdaCategory
  /** 대표 카드 조합 (끗·특수패는 여러 조합 중 하나) — 화면 표기는 i18n에서 포맷 */
  readonly detail: SeotdaRankDetail
  /**
   * 20장 덱에서 이 서열이 나오는 카드 두 장 조합의 수. 같은 "3끗"이라도 몇 갈래로
   * 나올 수 있는지가 다르고, 그 숫자가 곧 상대가 그 패를 들고 있을 확률의 분자다.
   */
  readonly combos: number
  /**
   * 이 서열 안에 섞여 있는 특수 능력 조합. 서열표만 보면 "1끗"은 그냥 최하위권이지만
   * 그중 한 조합(4·7 열끗)은 광땡을 잡는다 — 순위만 보여주면 정반대로 읽힌다.
   */
  readonly traits: readonly SeotdaRankTierTrait[]
}

function detailFor(category: SeotdaCategory, a: HwatuCard, b: HwatuCard): SeotdaRankDetail {
  if (category === 'gwangttaeng') return { kind: 'gwang', months: [a.month, b.month] }
  if (category === 'ttaeng') return { kind: 'pair', month: a.month }
  return { kind: 'months', months: [a.month, b.month] }
}

interface TierAccumulator {
  rank: number
  label: string
  category: SeotdaCategory
  detail: SeotdaRankDetail
  combos: number
  traitCounts: Map<SeotdaTrait, number>
}

function buildRankTable(): readonly SeotdaRankTier[] {
  // 20장에서 두 장을 뽑는 190가지를 전부 평가한다. 서열 목록·조합 수·특수 능력 분포가
  // 모두 같은 한 번의 순회에서 나오므로 엔진과 표가 어긋날 수 없다.
  const seen = new Map<number, TierAccumulator>()
  for (let i = 0; i < SEOTDA_DECK.length; i += 1) {
    for (let j = i + 1; j < SEOTDA_DECK.length; j += 1) {
      const a = SEOTDA_DECK[i] as HwatuCard
      const b = SEOTDA_DECK[j] as HwatuCard
      const hand = evaluateSeotdaHand([a, b])
      let tier = seen.get(hand.rank)
      if (!tier) {
        tier = {
          rank: hand.rank,
          label: hand.label,
          category: hand.category,
          detail: detailFor(hand.category, a, b),
          combos: 0,
          traitCounts: new Map(),
        }
        seen.set(hand.rank, tier)
      }
      tier.combos += 1
      for (const trait of hand.traits) {
        tier.traitCounts.set(trait, (tier.traitCounts.get(trait) ?? 0) + 1)
      }
    }
  }

  return [...seen.values()]
    .sort((a, b) => b.rank - a.rank)
    .map((tier) => ({
      rank: tier.rank,
      label: tier.label,
      category: tier.category,
      detail: tier.detail,
      combos: tier.combos,
      traits: [...tier.traitCounts.entries()].map(([trait, combos]) => ({ trait, combos })),
    }))
}

export const SEOTDA_RANK_TABLE: readonly SeotdaRankTier[] = buildRankTable()

/** 서열표 전체의 조합 수 합계 — 확률 문구의 분모(190). */
export const SEOTDA_TOTAL_COMBOS = SEOTDA_RANK_TABLE.reduce((sum, tier) => sum + tier.combos, 0)
