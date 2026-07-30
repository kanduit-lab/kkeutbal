import { FAIRNESS_ALGORITHM_VERSION } from './protocol'
import { createPublicFairnessDealPlan } from './receipt-deal-plan'
import { canonicalizeClientSeedHashes, parseRoundId } from './receipt-shape'
import {
  FAIRNESS_PUBLIC_RECEIPT_VERSION,
  type CreatePublicFairnessReceiptInput,
  type PublicFairnessReceipt,
} from './receipt-types'
import { parsePublicFairnessReceipt } from './receipt-validation'

export async function createPublicFairnessReceipt(
  input: CreatePublicFairnessReceiptInput,
): Promise<PublicFairnessReceipt> {
  if (input.shuffle.algorithmVersion !== FAIRNESS_ALGORITHM_VERSION) {
    throw new Error('Unsupported fairness algorithm version')
  }

  const roundId = parseRoundId(input.roundId)
  const game = input.game
  const clientSeedHashes = canonicalizeClientSeedHashes(input.shuffle.clientSeedHashes)
  const dealPlan = await createPublicFairnessDealPlan(roundId, game, input.participantCount)
  if (input.shuffle.shuffledDeckIds.length !== dealPlan.deckSize) {
    throw new Error('Shuffle result does not match the fixed game deck size')
  }

  return parsePublicFairnessReceipt({
    receiptVersion: FAIRNESS_PUBLIC_RECEIPT_VERSION,
    algorithmVersion: FAIRNESS_ALGORITHM_VERSION,
    roundId,
    game,
    seedAudit: {
      protocol: 'commit-reveal',
      serverSeedCommitment: input.shuffle.serverSeedCommitment,
      clientSeedHashes,
      finalSeedHash: input.shuffle.finalSeedHash,
      revealPolicy: 'after-round-finalized-authenticated-audit',
    },
    dealPlan,
    shuffledDeckCommitment: input.shuffle.deckCommitment,
  })
}
