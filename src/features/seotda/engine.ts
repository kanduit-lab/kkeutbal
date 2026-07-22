import { SEOTDA_DECK } from '../hwatu/cards'
import type { HwatuCard } from '../hwatu/types'
import type {
  SeotdaHand,
  SeotdaOutcome,
  SeotdaRules,
  SeotdaTrait,
} from './types'
import { SEOTDA_RANK, SEOTDA_SPECIALS, SEOTDA_TRAIT_COMBOS } from './types'

/**
 * 섯다 판정 엔진. 순수 함수만 둔다 — I/O · DB · 시간 · 난수 금지.
 *
 * 2단계로 나눈다:
 *   1단계 evaluateSeotdaHand  — 내 패의 절대 등급. 족보 Advisor 가 이것만 쓴다.
 *   2단계 resolveSeotdaShowdown — 상대 의존 판정(암행어사·땡잡이·구사) 포함 승부 확정.
 * 분리하지 않으면 Advisor 가 상대 패를 알아야 하는 모순이 생긴다.
 */

/** 섯다 덱(20장) id → 카드. 외부 입력을 정본 카드로 정규화하는 관문. */
const SEOTDA_CARD_BY_ID: ReadonlyMap<string, HwatuCard> = new Map(
  SEOTDA_DECK.map((card) => [card.id, card]),
)

function requireSeotdaCard(card: HwatuCard): HwatuCard {
  const canonical = SEOTDA_CARD_BY_ID.get(card.id)
  if (!canonical) {
    throw new Error(`evaluateSeotdaHand: 섯다 덱에 없는 카드 — ${card.id}`)
  }
  return canonical
}

interface HandGrade {
  readonly category: SeotdaHand['category']
  readonly label: string
  readonly rank: number
}

/** 광땡 판정. 섯다 덱의 광은 1·3·8월뿐이므로 조합은 13·18·38 셋이 전부다. */
function gradeGwangttaeng(a: HwatuCard, b: HwatuCard): HandGrade {
  const key = a.month < b.month ? `${a.month}${b.month}` : `${b.month}${a.month}`
  if (key === '38') {
    return { category: 'gwangttaeng', label: '38광땡', rank: SEOTDA_RANK.GWANGTTAENG_38 }
  }
  if (key === '18') {
    return { category: 'gwangttaeng', label: '18광땡', rank: SEOTDA_RANK.GWANGTTAENG_18 }
  }
  if (key === '13') {
    return { category: 'gwangttaeng', label: '13광땡', rank: SEOTDA_RANK.GWANGTTAENG_13 }
  }
  // 섯다 덱 구성상 도달 불가 — 덱 정의가 바뀌면 즉시 드러나도록 던진다.
  throw new Error(`evaluateSeotdaHand: 알 수 없는 광 조합 — ${key}`)
}

function gradeHand(a: HwatuCard, b: HwatuCard): HandGrade {
  if (a.kind === 'gwang' && b.kind === 'gwang') {
    return gradeGwangttaeng(a, b)
  }

  // 땡 = 같은 월 2장. 장땡(10월)이 최상위.
  if (a.month === b.month) {
    return {
      category: 'ttaeng',
      label: a.month === 10 ? '장땡' : `${a.month}땡`,
      rank: SEOTDA_RANK.TTAENG_BASE + a.month * 10,
    }
  }

  // 특수 하위 족보 — 월 조합(오름차순)으로 식별 (types.ts SEOTDA_SPECIALS).
  const lo = Math.min(a.month, b.month)
  const hi = Math.max(a.month, b.month)
  const special = SEOTDA_SPECIALS.find((s) => s.months[0] === lo && s.months[1] === hi)
  if (special) {
    return { category: 'special', label: special.label, rank: special.rank }
  }

  // 끗 = 두 장 월 합의 일의 자리. 9끗 = 갑오, 0끗 = 망통.
  const kkeut = (a.month + b.month) % 10
  const label = kkeut === 9 ? '갑오' : kkeut === 0 ? '망통' : `${kkeut}끗`
  return { category: 'kkeut', label, rank: SEOTDA_RANK.KKEUT_BASE + kkeut }
}

/**
 * 상대 의존 판정 플래그.
 *
 * 암행어사는 4·7 "열끗" 구성만 인정한다 — 4월·7월이라도 띠가 섞이면 효력 없음.
 * 땡잡이(3·7)·구사(4·9)는 월 조합만으로 판정한다.
 */
function detectTraits(a: HwatuCard, b: HwatuCard): readonly SeotdaTrait[] {
  const lo = Math.min(a.month, b.month)
  const hi = Math.max(a.month, b.month)
  return SEOTDA_TRAIT_COMBOS.filter(
    (combo) =>
      combo.months[0] === lo &&
      combo.months[1] === hi &&
      (combo.trait !== 'amhaengeosa' || (a.kind === 'yeol' && b.kind === 'yeol')),
  ).map((combo) => combo.trait)
}

/**
 * 두 장의 절대 족보를 판정한다.
 *
 * @param cards 섯다 덱(1~10월 비피 20장)의 카드 2장
 * @throws 덱에 없는 카드거나 같은 카드 2장이면 오류
 */
export function evaluateSeotdaHand(cards: readonly [HwatuCard, HwatuCard]): SeotdaHand {
  const first = requireSeotdaCard(cards[0])
  const second = requireSeotdaCard(cards[1])
  if (first.id === second.id) {
    throw new Error(`evaluateSeotdaHand: 같은 카드 2장 — ${first.id}`)
  }

  const grade = gradeHand(first, second)
  return {
    cards: [first, second],
    category: grade.category,
    label: grade.label,
    rank: grade.rank,
    traits: detectTraits(first, second),
  }
}

interface HandEntry {
  readonly hand: SeotdaHand
  readonly index: number
}

function assertNoDuplicateCards(hands: readonly SeotdaHand[]): void {
  const seen = new Set<string>()
  for (const hand of hands) {
    for (const card of hand.cards) {
      if (seen.has(card.id)) {
        throw new Error(`resolveSeotdaShowdown: 손패 간 중복 카드 — ${card.id}`)
      }
      seen.add(card.id)
    }
  }
}

/** 오름차순 index 배열에서 최고 rank 만 남긴다. */
function strongestOf(entries: readonly HandEntry[]): readonly HandEntry[] {
  const maxRank = entries.reduce(
    (max, entry) => Math.max(max, entry.hand.rank),
    Number.NEGATIVE_INFINITY,
  )
  return entries.filter((entry) => entry.hand.rank === maxRank)
}

/**
 * 동급 족보 처리 — 무승부 시 재경기 또는 선 우선.
 * `dealer-wins` 는 참가 순서가 빠른 쪽(선에 가까운 쪽)이 이기는 것으로 해석한다.
 */
function breakTie(
  tied: readonly HandEntry[],
  context: string,
  rules: SeotdaRules,
): SeotdaOutcome {
  const first = tied[0]
  if (!first) {
    throw new Error('resolveSeotdaShowdown: 내부 오류 — 동급 후보 없음')
  }
  if (rules.tieBreak === 'dealer-wins') {
    return { kind: 'win', winnerIndex: first.index, reason: `${context} — 선(先) 우선` }
  }
  return { kind: 'replay', reason: `${context} — 재경기` }
}

/** 최고 족보의 카테고리를 잡을 수 있는 trait. 룰 토글이 꺼져 있으면 null. */
function catcherTraitFor(
  category: SeotdaHand['category'],
  rules: SeotdaRules,
): SeotdaTrait | null {
  if (category === 'gwangttaeng' && rules.amhaengeosa) return 'amhaengeosa'
  if (category === 'ttaeng' && rules.ttaengjabi) return 'ttaengjabi'
  return null
}

/**
 * 여러 손패의 승부를 확정한다. 암행어사·땡잡이·구사 같은 상대 의존 규칙을 여기서 적용한다.
 *
 * 판정 순서:
 *   1. 구사(4·9) — rules.gusa 가 켜져 있으면 보유 즉시 판 무효 → 재경기.
 *   2. 잡기 — 최고 족보가 광땡이면 암행어사가, 땡이면 땡잡이가 잡는다 (룰 토글 각각).
 *      땡잡이는 광땡을 잡지 못한다 (최고 족보가 광땡이면 땡잡이는 후보가 아니다).
 *   3. 순수 rank 비교. 동급이면 rules.tieBreak (재경기 / 선 우선).
 *
 * @param hands 참가자 순서대로의 손패 (index 0 = 선)
 * @param rules 방의 룰 프리셋 (rooms.rule_preset)
 * @throws 손패가 2개 미만이거나 손패 간 카드가 중복되면 오류
 */
export function resolveSeotdaShowdown(
  hands: readonly SeotdaHand[],
  rules: SeotdaRules,
): SeotdaOutcome {
  if (hands.length < 2) {
    throw new Error('resolveSeotdaShowdown: 맞대결에는 손패가 2개 이상 필요하다')
  }
  assertNoDuplicateCards(hands)

  // 1. 구사 — 판 무효
  if (rules.gusa) {
    const gusaIndex = hands.findIndex((hand) => hand.traits.includes('gusa'))
    if (gusaIndex !== -1) {
      return { kind: 'replay', reason: `구사(4·9) 보유 — 판 무효, 재경기` }
    }
  }

  const entries: readonly HandEntry[] = hands.map((hand, index) => ({ hand, index }))
  const top = strongestOf(entries)
  const leader = top[0]
  if (!leader) {
    throw new Error('resolveSeotdaShowdown: 내부 오류 — 최고 족보 없음')
  }

  // 2. 잡기 — 상대 의존 판정. 잡은 손패가 판을 가져간다.
  const catcherTrait = catcherTraitFor(leader.hand.category, rules)
  if (catcherTrait) {
    const catchers = entries.filter(
      (entry) =>
        entry.hand.rank !== leader.hand.rank && entry.hand.traits.includes(catcherTrait),
    )
    if (catchers.length > 0) {
      const catcherName = catcherTrait === 'amhaengeosa' ? '암행어사(4·7)' : '땡잡이(3·7)'
      const best = strongestOf(catchers)
      const winner = best[0]
      if (best.length === 1 && winner) {
        return {
          kind: 'win',
          winnerIndex: winner.index,
          reason: `${catcherName}가 ${leader.hand.label}을 잡음`,
        }
      }
      return breakTie(best, `${catcherName}가 ${leader.hand.label}을 잡음, 동급 잡기 패`, rules)
    }
  }

  // 3. 순수 rank 비교
  if (top.length === 1) {
    return { kind: 'win', winnerIndex: leader.index, reason: `${leader.hand.label} 최고 서열` }
  }
  return breakTie(top, `${leader.hand.label} 동급`, rules)
}

const TRAIT_NOTES: Readonly<Record<SeotdaTrait, string>> = Object.freeze({
  amhaengeosa: '암행어사 — 광땡을 잡는다',
  ttaengjabi: '땡잡이 — 땡을 잡는다 (광땡 제외)',
  gusa: '구사 — 판 무효 재경기',
})

function describeBase(hand: SeotdaHand, pair: string): string {
  switch (hand.category) {
    case 'gwangttaeng':
      return `${hand.label} (${pair}) — 광땡, 최상위 구간`
    case 'ttaeng':
      return `${hand.label} (${pair}) — ${hand.cards[0].month}월 땡`
    case 'special':
      return `${hand.label} (${pair}) — 땡 아래 특수 족보`
    case 'kkeut': {
      const kkeut = hand.rank - SEOTDA_RANK.KKEUT_BASE
      if (hand.label === '갑오') return `갑오 (${pair}) — 9끗, 끗 중 최고`
      if (hand.label === '망통') return `망통 (${pair}) — 0끗, 끗 중 최저`
      return `${hand.label} (${pair}) — 월 합의 일의 자리 ${kkeut}`
    }
  }
}

/** 사람이 읽는 설명. Advisor UI 에 그대로 노출한다. */
export function describeSeotdaHand(hand: SeotdaHand): string {
  const pair = `${hand.cards[0].label} + ${hand.cards[1].label}`
  const base = describeBase(hand, pair)
  if (hand.traits.length === 0) {
    return base
  }
  const notes = hand.traits.map((trait) => TRAIT_NOTES[trait]).join(' · ')
  return `${base} · ${notes}`
}
