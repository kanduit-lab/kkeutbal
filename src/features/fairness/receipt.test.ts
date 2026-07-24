import { describe, expect, it } from 'vitest'

import { hashClientSeed, shuffleFairDeck } from './protocol'
import {
  createPublicFairnessDealPlan,
  createPublicFairnessReceipt,
  deserializePublicFairnessReceipt,
  parsePublicFairnessReceipt,
  serializePublicFairnessReceipt,
  verifyPublicFairnessReceipt,
} from './receipt'

const roundId = '11111111-1111-4111-8111-111111111111'
const serverSeed = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const aliceId = '22222222-2222-4222-8222-222222222222'
const bobId = '33333333-3333-4333-8333-333333333333'
const aliceSeed = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const bobSeed = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

async function shuffledFixture(deckSize = 20) {
  const [aliceHash, bobHash] = await Promise.all([
    hashClientSeed(roundId, aliceId, aliceSeed),
    hashClientSeed(roundId, bobId, bobSeed),
  ])
  return shuffleFairDeck({
    roundId,
    serverSeed,
    clientSeedHashes: [
      { userId: bobId, seedHash: bobHash },
      { userId: aliceId, seedHash: aliceHash },
    ],
    deckIds: Array.from({ length: deckSize }, (_, index) => `card-${index + 1}`),
  })
}

describe('public fairness receipt', () => {
  it('commits the fixed seotda and holdem deal shapes without card identities', async () => {
    const [seotda, holdem] = await Promise.all([
      createPublicFairnessDealPlan(roundId, 'seotda', 10),
      createPublicFairnessDealPlan(roundId, 'holdem', 8),
    ])

    expect(seotda).toMatchObject({
      game: 'seotda',
      deckSize: 20,
      privateCardsPerParticipant: 2,
      publicBoardStages: [],
    })
    expect(holdem).toMatchObject({
      game: 'holdem',
      deckSize: 52,
      privateCardsPerParticipant: 2,
      publicBoardStages: [3, 1, 1],
    })
    await expect(createPublicFairnessDealPlan(roundId, 'seotda', 11)).rejects.toThrow('exceeds')
    await expect(createPublicFairnessDealPlan(roundId, 'holdem', 24)).rejects.toThrow('exceeds')
  })

  it('selects only public commitments from the server shuffle result', async () => {
    const shuffle = await shuffledFixture()
    const receipt = await createPublicFairnessReceipt({
      roundId,
      game: 'seotda',
      participantCount: 2,
      shuffle,
    })
    const serialized = await serializePublicFairnessReceipt(receipt)
    const json = JSON.parse(serialized) as Record<string, unknown>
    const seedAudit = json.seedAudit as Record<string, unknown>

    expect(seedAudit.serverSeedCommitment).toBe(shuffle.serverSeedCommitment)
    expect(seedAudit.finalSeedHash).toBe(shuffle.finalSeedHash)
    expect(json.shuffledDeckCommitment).toBe(shuffle.deckCommitment)
    expect(seedAudit.clientSeedHashes).toEqual([
      { userId: aliceId, seedHash: shuffle.clientSeedHashes.find((entry) => entry.userId === aliceId)?.seedHash },
      { userId: bobId, seedHash: shuffle.clientSeedHashes.find((entry) => entry.userId === bobId)?.seedHash },
    ])

    expect(seedAudit.serverSeed).toBeUndefined()
    expect(seedAudit.finalSeed).toBeUndefined()
    expect(json.shuffledDeckIds).toBeUndefined()
    expect(json.privateCards).toBeUndefined()
    expect(serialized).not.toContain(serverSeed)
    expect(serialized).not.toContain(shuffle.finalSeed)
    for (const cardId of shuffle.shuffledDeckIds) expect(serialized).not.toContain(cardId)
  })

  it('round-trips deterministically and validates the deal-plan commitment', async () => {
    const receipt = await createPublicFairnessReceipt({
      roundId,
      game: 'holdem',
      participantCount: 6,
      shuffle: await shuffledFixture(52),
    })
    const serialized = await serializePublicFairnessReceipt(receipt)

    await expect(deserializePublicFairnessReceipt(serialized)).resolves.toEqual(receipt)
    await expect(verifyPublicFairnessReceipt(JSON.parse(serialized))).resolves.toBe(true)
    expect(await serializePublicFairnessReceipt(receipt)).toBe(serialized)

    const tampered = JSON.parse(serialized) as {
      dealPlan: { participantCount: number }
    }
    tampered.dealPlan.participantCount = 5
    await expect(verifyPublicFairnessReceipt(tampered)).resolves.toBe(false)
  })

  it('does not let a shuffle for one deck masquerade as the other game', async () => {
    await expect(
      createPublicFairnessReceipt({
        roundId,
        game: 'holdem',
        participantCount: 2,
        shuffle: await shuffledFixture(),
      }),
    ).rejects.toThrow('deck size')
  })

  it('rejects secret or private fields and mismatched deal plans at the strict public boundary', async () => {
    const receipt = await createPublicFairnessReceipt({
      roundId,
      game: 'seotda',
      participantCount: 2,
      shuffle: await shuffledFixture(),
    })
    const unsafeTopLevel = { ...receipt, shuffledDeckIds: ['secret-card'] }
    const unsafeSeedAudit = {
      ...receipt,
      seedAudit: { ...receipt.seedAudit, serverSeed },
    }
    const unsafeDealPlan = {
      ...receipt,
      dealPlan: { ...receipt.dealPlan, privateCardsPerParticipant: 3 },
    }

    expect(() => parsePublicFairnessReceipt(unsafeTopLevel)).toThrow()
    expect(() => parsePublicFairnessReceipt(unsafeSeedAudit)).toThrow()
    expect(() => parsePublicFairnessReceipt(unsafeDealPlan)).toThrow('fixed game rules')
  })
})
