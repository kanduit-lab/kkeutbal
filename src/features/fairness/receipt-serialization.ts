import type { PublicFairnessReceipt } from './receipt-types'
import { parsePublicFairnessReceipt, validatePublicFairnessReceipt } from './receipt-validation'

export async function serializePublicFairnessReceipt(value: unknown): Promise<string> {
  const receipt = parsePublicFairnessReceipt(value)
  if (!(await validatePublicFairnessReceipt(receipt))) {
    throw new Error('Public fairness receipt has an invalid deal plan commitment')
  }

  return JSON.stringify({
    receiptVersion: receipt.receiptVersion,
    algorithmVersion: receipt.algorithmVersion,
    roundId: receipt.roundId,
    game: receipt.game,
    seedAudit: {
      protocol: receipt.seedAudit.protocol,
      serverSeedCommitment: receipt.seedAudit.serverSeedCommitment,
      clientSeedHashes: receipt.seedAudit.clientSeedHashes.map((entry) => ({
        userId: entry.userId,
        seedHash: entry.seedHash,
      })),
      finalSeedHash: receipt.seedAudit.finalSeedHash,
      revealPolicy: receipt.seedAudit.revealPolicy,
    },
    dealPlan: {
      game: receipt.dealPlan.game,
      participantCount: receipt.dealPlan.participantCount,
      deckSize: receipt.dealPlan.deckSize,
      privateCardsPerParticipant: receipt.dealPlan.privateCardsPerParticipant,
      publicBoardStages: [...receipt.dealPlan.publicBoardStages],
      dealPlanCommitment: receipt.dealPlan.dealPlanCommitment,
    },
    shuffledDeckCommitment: receipt.shuffledDeckCommitment,
  })
}

export async function deserializePublicFairnessReceipt(
  serialized: string,
): Promise<PublicFairnessReceipt> {
  let value: unknown
  try {
    value = JSON.parse(serialized) as unknown
  } catch {
    throw new Error('Invalid public fairness receipt JSON')
  }

  const receipt = parsePublicFairnessReceipt(value)
  if (!(await validatePublicFairnessReceipt(receipt))) {
    throw new Error('Public fairness receipt has an invalid deal plan commitment')
  }
  return receipt
}
