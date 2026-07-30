import { freezeDealPlan, parseRoundId, sum } from './receipt-shape'
import { GAME_DEAL_RULES, type FairnessAuditedGame, type PublicFairnessDealPlan } from './receipt-types'

const RECEIPT_DOMAIN = 'kkeutbal/fairness/public-receipt/v1'
const encoder = new TextEncoder()

export async function createPublicFairnessDealPlan(
  roundId: string,
  game: FairnessAuditedGame,
  participantCount: number,
): Promise<PublicFairnessDealPlan> {
  const normalizedRoundId = parseRoundId(roundId)
  const rules = GAME_DEAL_RULES[game]
  if (!rules) throw new Error('Unsupported public fairness game')
  if (!Number.isInteger(participantCount) || participantCount < 2) {
    throw new Error('A fair game needs at least two participants')
  }

  const publicBoardStages = [...rules.publicBoardStages]
  const cardsRequired = participantCount * rules.privateCardsPerParticipant + sum(publicBoardStages)
  if (cardsRequired > rules.deckSize) {
    throw new Error('Deal plan exceeds the fixed game deck')
  }

  const dealPlanCommitment = await hashCanonical([
    RECEIPT_DOMAIN,
    'deal-plan',
    normalizedRoundId,
    game,
    participantCount,
    rules.deckSize,
    rules.privateCardsPerParticipant,
    publicBoardStages,
  ])

  return freezeDealPlan({
    game,
    participantCount,
    deckSize: rules.deckSize,
    privateCardsPerParticipant: rules.privateCardsPerParticipant,
    publicBoardStages,
    dealPlanCommitment,
  })
}

async function hashCanonical(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    toArrayBuffer(encoder.encode(JSON.stringify(value))),
  )
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}
