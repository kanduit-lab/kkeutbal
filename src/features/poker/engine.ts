import type { PokerCard } from './cards'

export type PokerCategory =
  | 'royal-flush'
  | 'straight-flush'
  | 'four-of-a-kind'
  | 'full-house'
  | 'flush'
  | 'straight'
  | 'three-of-a-kind'
  | 'two-pair'
  | 'one-pair'
  | 'high-card'

export interface PokerHand {
  readonly category: PokerCategory
  readonly label: string
  readonly cards: readonly PokerCard[]
  /** 비교용 서열 벡터: [카테고리 우선순위, ...키커 내림차순]. */
  readonly ranks: readonly number[]
}

const CATEGORY_LABEL: Readonly<Record<PokerCategory, string>> = Object.freeze({
  'royal-flush': '로열 플러시',
  'straight-flush': '스트레이트 플러시',
  'four-of-a-kind': '포카드',
  'full-house': '풀하우스',
  flush: '플러시',
  straight: '스트레이트',
  'three-of-a-kind': '트리플',
  'two-pair': '투페어',
  'one-pair': '원페어',
  'high-card': '하이카드',
})

// 카테고리 우선순위(높을수록 강함). ranks[0]에 담기는 1차 비교 키다.
const CATEGORY_PRIORITY: Readonly<Record<PokerCategory, number>> = Object.freeze({
  'royal-flush': 9,
  'straight-flush': 8,
  'four-of-a-kind': 7,
  'full-house': 6,
  flush: 5,
  straight: 4,
  'three-of-a-kind': 3,
  'two-pair': 2,
  'one-pair': 1,
  'high-card': 0,
})

const RANK_CHARS: Readonly<Record<number, string>> = Object.freeze({
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: 'T',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
})

function rankChar(rank: number): string {
  return RANK_CHARS[rank] ?? String(rank)
}

/** n장 중 5장을 고르는 모든 조합. 입력이 5~7장이므로 최대 21개로 작다. */
function combinationsOf5(cards: readonly PokerCard[]): readonly PokerCard[][] {
  const result: PokerCard[][] = []

  function pick(start: number, chosen: readonly PokerCard[]): void {
    if (chosen.length === 5) {
      result.push([...chosen])
      return
    }
    for (let i = start; i < cards.length; i += 1) {
      const card = cards[i]
      if (card === undefined) continue
      pick(i + 1, [...chosen, card])
    }
  }

  pick(0, [])
  return result
}

interface FiveCardEvaluation {
  readonly category: PokerCategory
  readonly ranks: readonly number[]
  readonly orderedCards: readonly PokerCard[]
}

/** 오름차순 정렬된 유니크 랭크 5개가 연속인지 판정. A-2-3-4-5(백스트레이트) 포함. */
function detectStraightHigh(descRanks: readonly number[]): number | null {
  const unique = Array.from(new Set(descRanks)).sort((a, b) => b - a)
  if (unique.length !== 5) return null

  const isNormal = unique.every((rank, i) => i === 0 || (unique[i - 1] ?? 0) - rank === 1)
  if (isNormal) return unique[0] ?? null

  const isWheel = unique[0] === 14 && unique[1] === 5 && unique[2] === 4 && unique[3] === 3 && unique[4] === 2
  if (isWheel) return 5

  return null
}

function evaluateFiveCards(hand: readonly PokerCard[]): FiveCardEvaluation {
  const descCards = [...hand].sort((a, b) => b.rank - a.rank)
  const descRanks = descCards.map((card) => card.rank)

  const isFlush = descCards.every((card) => card.suit === descCards[0]?.suit)
  const straightHigh = detectStraightHigh(descRanks)

  const countByRank = new Map<number, number>()
  for (const rank of descRanks) {
    countByRank.set(rank, (countByRank.get(rank) ?? 0) + 1)
  }
  // count 내림차순, 동률이면 rank 내림차순 — 트리플/페어/키커 순서 결정에 사용.
  const groups = Array.from(countByRank.entries())
    .sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]))
    .map(([rank, count]) => ({ rank, count }))
  const shape = groups.map((g) => g.count)

  if (isFlush && straightHigh !== null) {
    const category: PokerCategory = straightHigh === 14 ? 'royal-flush' : 'straight-flush'
    return {
      category,
      ranks: [CATEGORY_PRIORITY[category], straightHigh],
      orderedCards: descCards,
    }
  }

  if (shape[0] === 4) {
    const quad = groups[0]?.rank ?? 0
    const kicker = groups[1]?.rank ?? 0
    return {
      category: 'four-of-a-kind',
      ranks: [CATEGORY_PRIORITY['four-of-a-kind'], quad, kicker],
      orderedCards: descCards,
    }
  }

  if (shape[0] === 3 && shape[1] === 2) {
    const triple = groups[0]?.rank ?? 0
    const pair = groups[1]?.rank ?? 0
    return {
      category: 'full-house',
      ranks: [CATEGORY_PRIORITY['full-house'], triple, pair],
      orderedCards: descCards,
    }
  }

  if (isFlush) {
    return {
      category: 'flush',
      ranks: [CATEGORY_PRIORITY.flush, ...descRanks],
      orderedCards: descCards,
    }
  }

  if (straightHigh !== null) {
    return {
      category: 'straight',
      ranks: [CATEGORY_PRIORITY.straight, straightHigh],
      orderedCards: descCards,
    }
  }

  if (shape[0] === 3) {
    const triple = groups[0]?.rank ?? 0
    const kickers = groups.slice(1).map((g) => g.rank)
    return {
      category: 'three-of-a-kind',
      ranks: [CATEGORY_PRIORITY['three-of-a-kind'], triple, ...kickers],
      orderedCards: descCards,
    }
  }

  if (shape[0] === 2 && shape[1] === 2) {
    const highPair = groups[0]?.rank ?? 0
    const lowPair = groups[1]?.rank ?? 0
    const kicker = groups[2]?.rank ?? 0
    return {
      category: 'two-pair',
      ranks: [CATEGORY_PRIORITY['two-pair'], highPair, lowPair, kicker],
      orderedCards: descCards,
    }
  }

  if (shape[0] === 2) {
    const pair = groups[0]?.rank ?? 0
    const kickers = groups.slice(1).map((g) => g.rank)
    return {
      category: 'one-pair',
      ranks: [CATEGORY_PRIORITY['one-pair'], pair, ...kickers],
      orderedCards: descCards,
    }
  }

  return {
    category: 'high-card',
    ranks: [CATEGORY_PRIORITY['high-card'], ...descRanks],
    orderedCards: descCards,
  }
}

function compareRankVectors(a: readonly number[], b: readonly number[]): number {
  const length = Math.max(a.length, b.length)
  for (let i = 0; i < length; i += 1) {
    const av = a[i] ?? 0
    const bv = b[i] ?? 0
    if (av !== bv) return av - bv
  }
  return 0
}

function validateInput(cards: readonly PokerCard[]): void {
  if (cards.length < 5 || cards.length > 7) {
    throw new Error(`포커 핸드 평가는 5~7장이 필요하다 (입력: ${cards.length}장)`)
  }

  const ids = new Set<string>()
  for (const card of cards) {
    if (ids.has(card.id)) {
      throw new Error(`중복된 카드: ${card.id}`)
    }
    ids.add(card.id)
  }
}

/** 5~7장 중 최선의 5장 조합으로 족보를 판정한다. */
export function evaluatePokerHand(cards: readonly PokerCard[]): PokerHand {
  validateInput(cards)

  const candidates = combinationsOf5(cards).map(evaluateFiveCards)

  // 로컬 accumulator — 함수 밖으로 새지 않으므로 reduce 대신 변형 루프 사용 (coding-style 예외 규정)
  let best = candidates[0]
  if (best === undefined) {
    throw new Error('평가할 5장 조합을 만들 수 없다')
  }
  for (const candidate of candidates.slice(1)) {
    if (compareRankVectors(candidate.ranks, best.ranks) > 0) {
      best = candidate
    }
  }

  return {
    category: best.category,
    label: CATEGORY_LABEL[best.category],
    cards: best.orderedCards,
    ranks: best.ranks,
  }
}

function describeGroupRanks(hand: PokerHand): string {
  const [, first, second] = hand.ranks

  switch (hand.category) {
    case 'royal-flush':
      return '로열 플러시'
    case 'straight-flush':
      return `스트레이트 플러시 — ${rankChar(first ?? 0)} 하이`
    case 'four-of-a-kind':
      return `포카드 — ${rankChar(first ?? 0)} 포카드`
    case 'full-house':
      return `풀하우스 — ${rankChar(first ?? 0)} 트리플 + ${rankChar(second ?? 0)} 페어`
    case 'flush':
      return `플러시 — ${rankChar(first ?? 0)} 하이`
    case 'straight':
      return `스트레이트 — ${rankChar(first ?? 0)} 하이`
    case 'three-of-a-kind':
      return `트리플 — ${rankChar(first ?? 0)} 트리플`
    case 'two-pair':
      return `투페어 — ${rankChar(first ?? 0)} & ${rankChar(second ?? 0)}`
    case 'one-pair':
      return `원페어 — ${rankChar(first ?? 0)} 페어`
    case 'high-card':
      return `하이카드 — ${rankChar(first ?? 0)}`
    default:
      return CATEGORY_LABEL[hand.category]
  }
}

/** 족보를 한국어 한 줄 설명으로 변환한다. */
export function describePokerHand(hand: PokerHand): string {
  return describeGroupRanks(hand)
}
