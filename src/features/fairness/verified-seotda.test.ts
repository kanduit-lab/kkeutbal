import { describe, expect, it } from 'vitest'
import { generateFairnessSeed, hashClientSeed } from './protocol'
import {
  createVerifiedSeotdaDeal,
  privateSeotdaHand,
  resolveVerifiedSeotdaShowdown,
} from './verified-seotda'
import { SEOTDA_RULES_STANDARD } from '../seotda/types'

const ROUND_ID = '11111111-1111-4111-8111-111111111111'
const ALICE = '22222222-2222-4222-8222-222222222222'
const BOB = '33333333-3333-4333-8333-333333333333'
const CHARLIE = '44444444-4444-4444-8444-444444444444'

describe('verified Seotda deal', () => {
  it('binds hands to the seat snapshot and keeps other hands inaccessible by user id', async () => {
    const [aliceHash, bobHash] = await Promise.all([
      hashClientSeed(ROUND_ID, ALICE, generateFairnessSeed()),
      hashClientSeed(ROUND_ID, BOB, generateFairnessSeed()),
    ])
    const deal = await createVerifiedSeotdaDeal({
      roundId: ROUND_ID,
      serverSeed: generateFairnessSeed(),
      participants: [
        { userId: BOB, dealOrder: 1 },
        { userId: ALICE, dealOrder: 0 },
      ],
      clientSeedHashes: [
        { userId: BOB, seedHash: bobHash },
        { userId: ALICE, seedHash: aliceHash },
      ],
    })

    const alice = privateSeotdaHand(deal.shuffle.shuffledDeckIds, deal.participants, ALICE)
    const bob = privateSeotdaHand(deal.shuffle.shuffledDeckIds, deal.participants, BOB)
    expect(alice).not.toEqual(bob)
    expect(() => privateSeotdaHand(deal.shuffle.shuffledDeckIds, deal.participants, ROUND_ID)).toThrow(
      'non-participant',
    )
  })

  it('uses the canonical Seotda engine rather than accepting a claimed winner', async () => {
    const [aliceHash, bobHash, charlieHash] = await Promise.all([
      hashClientSeed(ROUND_ID, ALICE, generateFairnessSeed()),
      hashClientSeed(ROUND_ID, BOB, generateFairnessSeed()),
      hashClientSeed(ROUND_ID, CHARLIE, generateFairnessSeed()),
    ])
    const deal = await createVerifiedSeotdaDeal({
      roundId: ROUND_ID,
      serverSeed: generateFairnessSeed(),
      participants: [
        { userId: ALICE, dealOrder: 0 },
        { userId: BOB, dealOrder: 1 },
        { userId: CHARLIE, dealOrder: 2 },
      ],
      clientSeedHashes: [
        { userId: ALICE, seedHash: aliceHash },
        { userId: BOB, seedHash: bobHash },
        { userId: CHARLIE, seedHash: charlieHash },
      ],
    })

    const result = resolveVerifiedSeotdaShowdown(
      deal.shuffle.shuffledDeckIds,
      deal.participants,
      SEOTDA_RULES_STANDARD,
    )
    expect(result.hands).toHaveLength(3)
    expect(result.participants.map((participant) => participant.userId)).toEqual([ALICE, BOB, CHARLIE])
    expect(['win', 'replay']).toContain(result.outcome.kind)
    const afterCharlieFolds = resolveVerifiedSeotdaShowdown(
      deal.shuffle.shuffledDeckIds,
      deal.participants,
      SEOTDA_RULES_STANDARD,
      new Set([ALICE, BOB]),
    )
    expect(afterCharlieFolds.participants.map((participant) => participant.userId)).toEqual([ALICE, BOB])
    expect(afterCharlieFolds.hands.map((hand) => hand.userId)).toEqual([ALICE, BOB])
    expect(() =>
      resolveVerifiedSeotdaShowdown(
        deal.shuffle.shuffledDeckIds,
        deal.participants,
        SEOTDA_RULES_STANDARD,
        new Set([ALICE]),
      ),
    ).toThrow('two active contenders')
  })
})
