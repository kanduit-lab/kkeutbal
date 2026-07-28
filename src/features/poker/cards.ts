export type PokerSuit = 's' | 'h' | 'd' | 'c'

export interface PokerCard {
  readonly id: string

  readonly rank: number
  readonly suit: PokerSuit
  readonly label: string
}

export const SUIT_LABELS: Readonly<Record<PokerSuit, string>> = Object.freeze({
  s: '♠',
  h: '♥',
  d: '♦',
  c: '♣',
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

const SUITS: readonly PokerSuit[] = ['s', 'h', 'd', 'c']
const RANKS: readonly number[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]

function buildDeck(): readonly PokerCard[] {
  const deck: PokerCard[] = []

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const rankChar = RANK_CHARS[rank]
      if (rankChar === undefined) {
        throw new Error(`알 수 없는 랭크: ${rank}`)
      }

      deck.push({
        id: `${rankChar}${suit.toUpperCase()}`,
        rank,
        suit,
        label: `${SUIT_LABELS[suit]}${rankChar}`,
      })
    }
  }

  return Object.freeze(deck)
}

export const POKER_DECK: readonly PokerCard[] = buildDeck()

const BY_ID: ReadonlyMap<string, PokerCard> = new Map(POKER_DECK.map((card) => [card.id, card]))

export function findPokerCard(id: string): PokerCard | undefined {
  return BY_ID.get(id)
}