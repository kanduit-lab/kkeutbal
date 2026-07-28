import { SEOTDA_DECK } from '../hwatu/cards'
import type { HwatuCard } from '../hwatu/types'
import type { SeotdaHand, SeotdaOutcome, SeotdaRules, SeotdaTrait } from './types'
import { SEOTDA_RANK, SEOTDA_SPECIALS, SEOTDA_TRAIT_COMBOS } from './types'

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

  throw new Error(`evaluateSeotdaHand: 알 수 없는 광 조합 — ${key}`)
}

function gradeHand(a: HwatuCard, b: HwatuCard): HandGrade {
  if (a.kind === 'gwang' && b.kind === 'gwang') {
    return gradeGwangttaeng(a, b)
  }

  if (a.month === b.month) {
    return {
      category: 'ttaeng',
      label: a.month === 10 ? '장땡' : `${a.month}땡`,
      rank: SEOTDA_RANK.TTAENG_BASE + a.month * 10,
    }
  }

  const lo = Math.min(a.month, b.month)
  const hi = Math.max(a.month, b.month)
  const special = SEOTDA_SPECIALS.find((s) => s.months[0] === lo && s.months[1] === hi)
  if (special) {
    return { category: 'special', label: special.label, rank: special.rank }
  }

  const kkeut = (a.month + b.month) % 10
  const label = kkeut === 9 ? '갑오' : kkeut === 0 ? '망통' : `${kkeut}끗`
  return { category: 'kkeut', label, rank: SEOTDA_RANK.KKEUT_BASE + kkeut }
}

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

function strongestOf(entries: readonly HandEntry[]): readonly HandEntry[] {
  const maxRank = entries.reduce(
    (max, entry) => Math.max(max, entry.hand.rank),
    Number.NEGATIVE_INFINITY,
  )
  return entries.filter((entry) => entry.hand.rank === maxRank)
}

function breakTie(tied: readonly HandEntry[], context: string, rules: SeotdaRules): SeotdaOutcome {
  const first = tied[0]
  if (!first) {
    throw new Error('resolveSeotdaShowdown: 내부 오류 — 동급 후보 없음')
  }
  if (rules.tieBreak === 'dealer-wins') {
    return { kind: 'win', winnerIndex: first.index, reason: `${context} — 선(先) 우선` }
  }
  return { kind: 'replay', reason: `${context} — 재경기` }
}

function catcherTraitFor(category: SeotdaHand['category'], rules: SeotdaRules): SeotdaTrait | null {
  if (category === 'gwangttaeng' && rules.amhaengeosa) return 'amhaengeosa'
  if (category === 'ttaeng' && rules.ttaengjabi) return 'ttaengjabi'
  return null
}

export function resolveSeotdaShowdown(
  hands: readonly SeotdaHand[],
  rules: SeotdaRules,
): SeotdaOutcome {
  if (hands.length < 2) {
    throw new Error('resolveSeotdaShowdown: 맞대결에는 손패가 2개 이상 필요하다')
  }

  const canonicalHands = hands.map((hand) => evaluateSeotdaHand(hand.cards))
  assertNoDuplicateCards(canonicalHands)

  if (rules.gusa) {
    const gusaIndex = canonicalHands.findIndex((hand) => hand.traits.includes('gusa'))
    if (gusaIndex !== -1) {
      return { kind: 'replay', reason: `구사(4·9) 보유 — 판 무효, 재경기` }
    }
  }

  const entries: readonly HandEntry[] = canonicalHands.map((hand, index) => ({ hand, index }))
  const top = strongestOf(entries)
  const leader = top[0]
  if (!leader) {
    throw new Error('resolveSeotdaShowdown: 내부 오류 — 최고 족보 없음')
  }

  const catcherTrait = catcherTraitFor(leader.hand.category, rules)
  if (catcherTrait) {
    const catchers = entries.filter(
      (entry) => entry.hand.rank !== leader.hand.rank && entry.hand.traits.includes(catcherTrait),
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

export function describeSeotdaHand(hand: SeotdaHand): string {
  const pair = `${hand.cards[0].label} + ${hand.cards[1].label}`
  const base = describeBase(hand, pair)
  if (hand.traits.length === 0) {
    return base
  }
  const notes = hand.traits.map((trait) => TRAIT_NOTES[trait]).join(' · ')
  return `${base} · ${notes}`
}