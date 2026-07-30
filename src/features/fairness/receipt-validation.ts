import type { z } from 'zod'

import { createPublicFairnessDealPlan } from './receipt-deal-plan'
import {
  canonicalizeClientSeedHashes,
  freezeReceipt,
  normalizeHash,
  numbersEqual,
  parseRoundId,
  sum,
} from './receipt-shape'
import {
  GAME_DEAL_RULES,
  publicDealPlanSchema,
  publicFairnessReceiptSchema,
  type FairnessAuditedGame,
  type PublicFairnessReceipt,
} from './receipt-types'

export function parsePublicFairnessReceipt(value: unknown): PublicFairnessReceipt {
  const parsed = publicFairnessReceiptSchema.parse(value)
  const roundId = parseRoundId(parsed.roundId)
  const clientSeedHashes = canonicalizeClientSeedHashes(parsed.seedAudit.clientSeedHashes)
  assertStaticDealPlan(parsed.game, parsed.dealPlan)

  return freezeReceipt({
    receiptVersion: parsed.receiptVersion,
    algorithmVersion: parsed.algorithmVersion,
    roundId,
    game: parsed.game,
    seedAudit: {
      protocol: parsed.seedAudit.protocol,
      serverSeedCommitment: normalizeHash(parsed.seedAudit.serverSeedCommitment),
      clientSeedHashes,
      finalSeedHash: normalizeHash(parsed.seedAudit.finalSeedHash),
      revealPolicy: parsed.seedAudit.revealPolicy,
    },
    dealPlan: {
      game: parsed.dealPlan.game,
      participantCount: parsed.dealPlan.participantCount,
      deckSize: parsed.dealPlan.deckSize,
      privateCardsPerParticipant: parsed.dealPlan.privateCardsPerParticipant,
      publicBoardStages: parsed.dealPlan.publicBoardStages,
      dealPlanCommitment: normalizeHash(parsed.dealPlan.dealPlanCommitment),
    },
    shuffledDeckCommitment: normalizeHash(parsed.shuffledDeckCommitment),
  })
}

export async function validatePublicFairnessReceipt(value: unknown): Promise<boolean> {
  try {
    const receipt = parsePublicFairnessReceipt(value)
    const expectedPlan = await createPublicFairnessDealPlan(
      receipt.roundId,
      receipt.game,
      receipt.dealPlan.participantCount,
    )
    return receipt.dealPlan.dealPlanCommitment === expectedPlan.dealPlanCommitment
  } catch {
    return false
  }
}

function assertStaticDealPlan(
  game: FairnessAuditedGame,
  plan: z.infer<typeof publicDealPlanSchema>,
): void {
  if (plan.game !== game) throw new Error('Receipt game and deal plan game do not match')
  const rules = GAME_DEAL_RULES[game]
  if (
    plan.deckSize !== rules.deckSize ||
    plan.privateCardsPerParticipant !== rules.privateCardsPerParticipant ||
    !numbersEqual(plan.publicBoardStages, rules.publicBoardStages)
  ) {
    throw new Error('Receipt deal plan does not match the fixed game rules')
  }
  if (
    plan.participantCount * plan.privateCardsPerParticipant + sum(plan.publicBoardStages) >
    plan.deckSize
  ) {
    throw new Error('Receipt deal plan exceeds the fixed game deck')
  }
}
