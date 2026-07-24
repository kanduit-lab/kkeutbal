import { describe, expect, it } from 'vitest'
import {
  commitServerSeed,
  deriveFinalSeed,
  hashClientSeed,
  shuffleFairDeck,
  verifyFairShuffle,
} from './protocol'

const roundId = '11111111-1111-4111-8111-111111111111'
const serverSeed = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const aliceId = '22222222-2222-4222-8222-222222222222'
const bobId = '33333333-3333-4333-8333-333333333333'
const aliceSeed = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const bobSeed = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const deckIds = ['01-gwang', '01-tti', '02-yeol', '02-tti', '03-gwang', '03-tti']

async function fixture() {
  const [aliceHash, bobHash] = await Promise.all([
    hashClientSeed(roundId, aliceId, aliceSeed),
    hashClientSeed(roundId, bobId, bobSeed),
  ])
  return {
    aliceHash,
    bobHash,
    clientSeedHashes: [
      { userId: aliceId, seedHash: aliceHash },
      { userId: bobId, seedHash: bobHash },
    ],
  }
}

describe('fairness commit-reveal protocol', () => {
  it('produces a stable commitment and final seed for the same public inputs', async () => {
    const { clientSeedHashes } = await fixture()
    const [commitment, finalSeed] = await Promise.all([
      commitServerSeed(roundId, serverSeed),
      deriveFinalSeed(roundId, serverSeed, clientSeedHashes),
    ])

    expect(commitment).toBe('00103f3bbc5c9f588f714cbf87d26fce01f9ab1bff7b44c988619ab91cdc776c')
    expect(finalSeed).toBe('50a6d7af1c82de08fe0ae3b93ea5091b56fcf40522c9d533e61bdfe8cf46a591')
  })

  it('canonicalizes contributor order without changing the shuffled order', async () => {
    const { clientSeedHashes } = await fixture()
    const forward = await shuffleFairDeck({ roundId, serverSeed, clientSeedHashes, deckIds })
    const reverse = await shuffleFairDeck({
      roundId,
      serverSeed,
      clientSeedHashes: [...clientSeedHashes].reverse(),
      deckIds,
    })

    expect(forward.shuffledDeckIds).toEqual(reverse.shuffledDeckIds)
    expect(forward.deckCommitment).toBe(reverse.deckCommitment)
    expect(forward.shuffledDeckIds).toHaveLength(deckIds.length)
    expect([...forward.shuffledDeckIds].sort()).toEqual([...deckIds].sort())
  })

  it('changes the outcome when a participant contribution changes', async () => {
    const { clientSeedHashes } = await fixture()
    const baseline = await shuffleFairDeck({ roundId, serverSeed, clientSeedHashes, deckIds })
    const alteredBobHash = await hashClientSeed(
      roundId,
      bobId,
      'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    )
    const altered = await shuffleFairDeck({
      roundId,
      serverSeed,
      clientSeedHashes: [clientSeedHashes[0]!, { userId: bobId, seedHash: alteredBobHash }],
      deckIds,
    })

    expect(altered.finalSeed).not.toBe(baseline.finalSeed)
    expect(altered.shuffledDeckIds).not.toEqual(baseline.shuffledDeckIds)
  })

  it('verifies a revealed receipt and rejects a tampered deck', async () => {
    const { clientSeedHashes } = await fixture()
    const result = await shuffleFairDeck({ roundId, serverSeed, clientSeedHashes, deckIds })
    const receipt = {
      roundId,
      serverSeed,
      serverSeedCommitment: result.serverSeedCommitment,
      clientSeedHashes,
      deckCommitment: result.deckCommitment,
      shuffledDeckIds: result.shuffledDeckIds,
    }

    await expect(verifyFairShuffle(receipt, deckIds)).resolves.toEqual({
      commitmentMatches: true,
      deckMatches: true,
      shuffledDeckMatches: true,
      valid: true,
    })
    await expect(
      verifyFairShuffle({ ...receipt, shuffledDeckIds: [...result.shuffledDeckIds].reverse() }, deckIds),
    ).resolves.toMatchObject({ valid: false, shuffledDeckMatches: false })
  })

  it('rejects duplicate contributors and malformed seeds', async () => {
    const { aliceHash } = await fixture()
    await expect(
      shuffleFairDeck({
        roundId,
        serverSeed,
        clientSeedHashes: [
          { userId: aliceId, seedHash: aliceHash },
          { userId: aliceId, seedHash: aliceHash },
        ],
        deckIds,
      }),
    ).rejects.toThrow('Duplicate client seed contributor')
    await expect(commitServerSeed(roundId, 'not-a-seed')).rejects.toThrow('32-byte hex')
  })
})
