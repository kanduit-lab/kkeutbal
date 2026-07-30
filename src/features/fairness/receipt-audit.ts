import {
  shuffleFairDeck,
  verifyFairShuffle,
  type ClientSeedHash,
  type FairShuffleReceipt,
} from './protocol'
import { parsePublicFairnessReceipt, validatePublicFairnessReceipt } from './receipt-validation'

export async function verifyPublicFairnessAudit(
  publicValue: unknown,
  reveal: FairShuffleReceipt,
  originalDeckIds: readonly string[],
): Promise<boolean> {
  try {
    const receipt = parsePublicFairnessReceipt(publicValue)
    if (!(await validatePublicFairnessReceipt(receipt))) return false
    if (receipt.roundId !== reveal.roundId) return false

    const [verification, reproduced] = await Promise.all([
      verifyFairShuffle(reveal, originalDeckIds),
      shuffleFairDeck({
        roundId: reveal.roundId,
        serverSeed: reveal.serverSeed,
        clientSeedHashes: reveal.clientSeedHashes,
        deckIds: originalDeckIds,
      }),
    ])
    if (!verification.valid) return false

    return (
      receipt.algorithmVersion === reproduced.algorithmVersion &&
      receipt.seedAudit.serverSeedCommitment === reproduced.serverSeedCommitment &&
      sameClientSeedHashes(receipt.seedAudit.clientSeedHashes, reproduced.clientSeedHashes) &&
      receipt.seedAudit.finalSeedHash === reproduced.finalSeedHash &&
      receipt.shuffledDeckCommitment === reproduced.deckCommitment
    )
  } catch {
    return false
  }
}

function sameClientSeedHashes(
  left: readonly ClientSeedHash[],
  right: readonly ClientSeedHash[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (entry, index) =>
        entry.userId === right[index]?.userId && entry.seedHash === right[index]?.seedHash,
    )
  )
}
