import { SEOTDA_DECK, findCard } from '../hwatu/cards'
import type { HwatuCard } from '../hwatu/types'
import { evaluateSeotdaHand, resolveSeotdaShowdown } from '../seotda/engine'
import type { SeotdaOutcome, SeotdaRules } from '../seotda/types'
import {
  shuffleFairDeck,
  type ClientSeedHash,
  type FairShuffleReceipt,
  type FairShuffleResult,
} from './protocol'
import { createPublicFairnessReceipt, type PublicFairnessReceipt } from './receipt'

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

const CARDS_PER_PARTICIPANT = 2

export async function createVerifiedSeotdaDeal(input: {
  readonly roundId: string
  readonly serverSeed: string
  readonly participants: readonly VerifiedSeotdaParticipant[]
  readonly clientSeedHashes: readonly ClientSeedHash[]
}): Promise<VerifiedSeotdaDeal> {
  const participants = normalizeParticipants(input.participants)
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
    game: 'seotda',
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
): readonly [HwatuCard, HwatuCard] {
  const ordered = normalizeParticipants(participants)
  const participantIndex = ordered.findIndex((participant) => participant.userId === userId)
  if (participantIndex < 0) throw new Error('Verified Seotda hand requested by a non-participant')
  if (shuffledDeckIds.length !== SEOTDA_DECK.length) throw new Error('Invalid verified Seotda deck')

  const offset = participantIndex * CARDS_PER_PARTICIPANT
  const first = findSeotdaCard(shuffledDeckIds[offset])
  const second = findSeotdaCard(shuffledDeckIds[offset + 1])
  if (first.id === second.id) throw new Error('Invalid verified Seotda hand')
  return Object.freeze([first, second])
}

export function resolveVerifiedSeotdaShowdown(
  shuffledDeckIds: readonly string[],
  participants: readonly VerifiedSeotdaParticipant[],
  rules: SeotdaRules,
  eligibleUserIds?: ReadonlySet<string>,
): VerifiedSeotdaShowdown {
  const ordered = normalizeParticipants(participants)
  const contenders = eligibleUserIds
    ? ordered.filter((participant) => eligibleUserIds.has(participant.userId))
    : ordered
  if (contenders.length < 2) throw new Error('Verified Seotda showdown needs two active contenders')
  const hands = contenders.map((participant) => ({
    userId: participant.userId,
    cards: privateSeotdaHand(shuffledDeckIds, ordered, participant.userId),
  }))
  const outcome = resolveSeotdaShowdown(
    hands.map((hand) => evaluateSeotdaHand(hand.cards)),
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
): readonly VerifiedSeotdaParticipant[] {
  if (participants.length < 2 || participants.length > SEOTDA_DECK.length / CARDS_PER_PARTICIPANT) {
    throw new Error('Verified Seotda needs between two and ten participants')
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