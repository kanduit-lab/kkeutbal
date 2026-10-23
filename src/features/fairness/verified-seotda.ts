import { SEOTDA_DECK, findCard } from '../hwatu/cards'
import type { HwatuCard } from '../hwatu/types'
import { evaluateSeotdaHand, resolveSeotdaShowdown } from '../seotda/engine'
import { bestSeotdaPair, chosenSeotdaPair, toThreeCardHand } from '../seotda/three-card'
import type { SeotdaCardCount, SeotdaHand, SeotdaOutcome, SeotdaRules } from '../seotda/types'
import {
  shuffleFairDeck,
  type ClientSeedHash,
  type FairShuffleReceipt,
  type FairShuffleResult,
} from './protocol'
import {
  createPublicFairnessReceipt,
  type FairnessAuditedGame,
  type PublicFairnessReceipt,
} from './receipt'

export interface VerifiedSeotdaParticipant {
  readonly userId: string
  readonly dealOrder: number
}

export interface VerifiedSeotdaDeal {
  readonly shuffle: FairShuffleResult
  readonly publicReceipt: PublicFairnessReceipt
  readonly participants: readonly VerifiedSeotdaParticipant[]
}

export interface VerifiedSeotdaShowdown {
  readonly outcome: SeotdaOutcome

  readonly participants: readonly VerifiedSeotdaParticipant[]
  readonly hands: readonly {
    readonly userId: string
    readonly cards: readonly [HwatuCard, HwatuCard]
  }[]
}

export interface VerifiedSeotdaShowdownOptions {
  readonly cardCount: SeotdaCardCount
  /** 3장 섯다에서 1차 베팅 중이면 앞 두 장만으로 판정한다 */
  readonly street: number
  /** 참가자가 고른 두 장. 없거나 무효면 세 장에서 가장 높은 쌍으로 판정한다 */
  readonly choices: ReadonlyMap<string, readonly string[]>
}

const TWO_CARD_SHOWDOWN: VerifiedSeotdaShowdownOptions = {
  cardCount: 2,
  street: 1,
  choices: new Map(),
}

export function seotdaFairnessGame(cardCount: SeotdaCardCount): 'seotda' | 'seotda3' {
  return cardCount === 3 ? 'seotda3' : 'seotda'
}

export function seotdaCardCountOf(game: FairnessAuditedGame): SeotdaCardCount {
  if (game === 'seotda3') return 3
  if (game === 'seotda') return 2
  throw new Error('Fair round receipt is not a Seotda deal')
}

export async function createVerifiedSeotdaDeal(input: {
  readonly roundId: string
  readonly serverSeed: string
  readonly participants: readonly VerifiedSeotdaParticipant[]
  readonly clientSeedHashes: readonly ClientSeedHash[]
  readonly cardCount: SeotdaCardCount
}): Promise<VerifiedSeotdaDeal> {
  const participants = normalizeParticipants(input.participants, input.cardCount)
  const participantIds = new Set(participants.map((participant) => participant.userId))
  if (input.clientSeedHashes.some((entry) => !participantIds.has(entry.userId))) {
    throw new Error('Verified Seotda seed contributors must match the seat snapshot')
  }
  if (
    new Set(input.clientSeedHashes.map((entry) => entry.userId)).size !==
    input.clientSeedHashes.length
  ) {
    throw new Error('Verified Seotda seed contributors must be unique')
  }

  const shuffle = await shuffleFairDeck({
    roundId: input.roundId,
    serverSeed: input.serverSeed,
    clientSeedHashes: input.clientSeedHashes,
    deckIds: SEOTDA_DECK.map((card) => card.id),
  })
  const publicReceipt = await createPublicFairnessReceipt({
    roundId: input.roundId,
    game: seotdaFairnessGame(input.cardCount),
    participantCount: participants.length,
    shuffle,
  })

  return Object.freeze({
    shuffle,
    publicReceipt,
    participants: Object.freeze(
      participants.map((participant) => Object.freeze({ ...participant })),
    ),
  })
}

export function privateSeotdaHand(
  shuffledDeckIds: readonly string[],
  participants: readonly VerifiedSeotdaParticipant[],
  userId: string,
  cardCount: SeotdaCardCount = 2,
): readonly HwatuCard[] {
  const ordered = normalizeParticipants(participants, cardCount)
  const participantIndex = ordered.findIndex((participant) => participant.userId === userId)
  if (participantIndex < 0) throw new Error('Verified Seotda hand requested by a non-participant')
  if (shuffledDeckIds.length !== SEOTDA_DECK.length) throw new Error('Invalid verified Seotda deck')

  const offset = participantIndex * cardCount
  const cards = Array.from({ length: cardCount }, (_, index) =>
    findSeotdaCard(shuffledDeckIds[offset + index]),
  )
  if (new Set(cards.map((card) => card.id)).size !== cards.length) {
    throw new Error('Invalid verified Seotda hand')
  }
  return Object.freeze(cards)
}

function showdownHand(
  cards: readonly HwatuCard[],
  userId: string,
  options: VerifiedSeotdaShowdownOptions,
): SeotdaHand {
  const [first, second] = cards
  if (!first || !second) throw new Error('Invalid verified Seotda hand')
  const hand = options.cardCount === 3 && options.street === 2 ? toThreeCardHand(cards) : null
  if (!hand) return evaluateSeotdaHand([first, second])
  const choice = options.choices.get(userId)
  return (choice ? chosenSeotdaPair(hand, choice) : null) ?? bestSeotdaPair(hand)
}

export function resolveVerifiedSeotdaShowdown(
  shuffledDeckIds: readonly string[],
  participants: readonly VerifiedSeotdaParticipant[],
  rules: SeotdaRules,
  eligibleUserIds?: ReadonlySet<string>,
  options: VerifiedSeotdaShowdownOptions = TWO_CARD_SHOWDOWN,
): VerifiedSeotdaShowdown {
  const ordered = normalizeParticipants(participants, options.cardCount)
  const contenders = eligibleUserIds
    ? ordered.filter((participant) => eligibleUserIds.has(participant.userId))
    : ordered
  if (contenders.length < 2) throw new Error('Verified Seotda showdown needs two active contenders')
  const evaluated = contenders.map((participant) => ({
    userId: participant.userId,
    hand: showdownHand(
      privateSeotdaHand(shuffledDeckIds, ordered, participant.userId, options.cardCount),
      participant.userId,
      options,
    ),
  }))
  const hands = evaluated.map((entry) => ({ userId: entry.userId, cards: entry.hand.cards }))
  const outcome = resolveSeotdaShowdown(
    evaluated.map((entry) => entry.hand),
    rules,
  )

  return Object.freeze({
    outcome,
    participants: Object.freeze(contenders.map((participant) => Object.freeze({ ...participant }))),
    hands: Object.freeze(
      hands.map((hand) =>
        Object.freeze({
          userId: hand.userId,
          cards: Object.freeze([...hand.cards]) as [HwatuCard, HwatuCard],
        }),
      ),
    ),
  })
}

export function fullVerifiedSeotdaReceipt(
  deal: VerifiedSeotdaDeal,
  serverSeed: string,
): FairShuffleReceipt {
  return Object.freeze({
    roundId: deal.publicReceipt.roundId,
    serverSeed,
    serverSeedCommitment: deal.shuffle.serverSeedCommitment,
    clientSeedHashes: deal.shuffle.clientSeedHashes,
    deckCommitment: deal.shuffle.deckCommitment,
    shuffledDeckIds: deal.shuffle.shuffledDeckIds,
  })
}

function normalizeParticipants(
  participants: readonly VerifiedSeotdaParticipant[],
  cardCount: SeotdaCardCount,
): readonly VerifiedSeotdaParticipant[] {
  if (
    participants.length < 2 ||
    participants.length > Math.floor(SEOTDA_DECK.length / cardCount)
  ) {
    throw new Error('Verified Seotda participant count does not fit the deck')
  }
  const ordered = [...participants].map((participant) => ({ ...participant }))
  ordered.sort((left, right) => left.dealOrder - right.dealOrder)
  const ids = new Set<string>()
  for (let index = 0; index < ordered.length; index += 1) {
    const participant = ordered[index]
    if (!participant) throw new Error('Invalid verified Seotda seat snapshot')
    if (!isUuid(participant.userId)) throw new Error('Invalid verified Seotda participant id')
    if (!Number.isInteger(participant.dealOrder) || participant.dealOrder !== index) {
      throw new Error('Invalid verified Seotda deal order')
    }
    if (ids.has(participant.userId)) throw new Error('Duplicate verified Seotda participant')
    ids.add(participant.userId)
  }
  return ordered
}

function findSeotdaCard(id: string | undefined): HwatuCard {
  if (!id) throw new Error('Invalid verified Seotda deck')
  const card = findCard(id)
  if (!card || !card.seotda) throw new Error('Invalid verified Seotda deck')
  return card
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}