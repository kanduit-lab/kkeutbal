import { catchingCategory, catcherOf, type SeotdaCatcherTrait } from '@/features/seotda/three-card'
import type { SeotdaCategory, SeotdaHand, SeotdaRules } from '@/features/seotda/types'
import { seotdaTierPosition } from './seotda-rank-table'
import type { SeotdaReading } from './seotda-reading'

/** 한 쌍이 서열과 무관하게 이기거나 지는 상대 하나 */
export interface SeotdaFlip {
  readonly pair: SeotdaHand
  /** 이 쌍의 서열 단계. 표시용 위치이고 승패의 근거는 아니다 */
  readonly tierPosition: number
  /** 잡는 쪽이면 `catches`, 잡히는 쪽이면 `caught` */
  readonly dir: 'catches' | 'caught'
  /** 이 관계를 만드는 패 (암행어사·땡잡이) */
  readonly catcher: SeotdaCatcherTrait
  /** 잡는 쪽이면 잡아내는 상대 분류, 잡히는 쪽이면 내 패의 분류 */
  readonly category: SeotdaCategory
}

export interface SeotdaChoiceReading {
  readonly pair: SeotdaHand
  /** 승부에 낼 수 있는 쌍 중 서열이 가장 높은 쌍 */
  readonly isBest: boolean
  /** 이 쌍을 냈을 때 서열과 무관하게 뒤집히는 상대 (이기는 쪽·지는 쪽 모두) */
  readonly flips: readonly SeotdaFlip[]
}

export interface SeotdaCombinedReading {
  readonly choices: readonly SeotdaChoiceReading[]
  /**
   * 최고 패의 뒤집힘. 서열만 봐서는 보이지 않는 결말이라 결과 화면 맨 위에 따로 적는다.
   * 뒤집힘이 없으면 null.
   */
  readonly bestFlip: SeotdaFlip | null
}

function flipOf(pair: SeotdaHand, tierPosition: number, rules: SeotdaRules): SeotdaFlip | null {
  const against = catchingCategory(pair, rules)
  if (against) {
    const catcher: SeotdaCatcherTrait = against === 'gwangttaeng' ? 'amhaengeosa' : 'ttaengjabi'
    return { pair, tierPosition, dir: 'catches', catcher, category: against }
  }
  const caught = catcherOf(pair, rules)
  if (caught) {
    return { pair, tierPosition, dir: 'caught', catcher: caught.catcher, category: caught.caught }
  }
  return null
}

/**
 * 세 장의 세 쌍을 서열과 뒤집힘으로 읽는다. 순위만 세우면 4·7 열끗 열끗(1끗)이 1끗에서
 * 끝나지만, 실제로는 광땡을 잡는 패다.
 *
 * `tierPositionOf`를 넘기지 않으면 판독기와 같은 서열표(`seotdaTierPosition`)를 쓴다.
 */
export function readSeotdaCombined(
  reading: SeotdaReading,
  rules: SeotdaRules,
  tierPositionOf: (rank: number) => number = seotdaTierPosition,
): SeotdaCombinedReading {
  const bestRank = reading.hand.rank
  const choices = reading.choices.map((pair) => {
    const flip = flipOf(pair, tierPositionOf(pair.rank), rules)
    return {
      pair,
      isBest: pair.rank === bestRank,
      flips: flip ? [flip] : [],
    }
  })
  const best = choices.find((choice) => choice.isBest)
  return { choices, bestFlip: best?.flips[0] ?? null }
}

/** 세 장 중 서열이 가장 높은 쌍이 이기거나 지는 관계가 있으면 그것을, 없으면 null */
export function readBestFlip(
  reading: SeotdaReading,
  rules: SeotdaRules,
  tierPositionOf: (rank: number) => number,
): SeotdaFlip | null {
  return flipOf(reading.hand, tierPositionOf(reading.hand.rank), rules)
}
