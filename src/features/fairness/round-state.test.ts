import { describe, expect, it } from 'vitest'
import {
  FairRoundStateError,
  abortFairRound,
  createFairRoundState,
  revealFairRound,
  sealFairRound,
  submitFairRoundSeed,
} from './round-state'
import {
  FAIRNESS_PUBLIC_RECEIPT_VERSION,
  type PublicFairnessReceipt,
} from './receipt'
import { FAIRNESS_ALGORITHM_VERSION } from './protocol'

const ids = {
  round: '11111111-1111-4111-8111-111111111111',
  first: '22222222-2222-4222-8222-222222222222',
  second: '33333333-3333-4333-8333-333333333333',
}

const hashes = {
  server: 'a'.repeat(64),
  first: 'b'.repeat(64),
  second: 'c'.repeat(64),
  deck: 'd'.repeat(64),
}

const startedAt = new Date('2026-07-24T12:00:00.000Z')
const deadline = new Date('2026-07-24T12:00:30.000Z')

function state() {
  return createFairRoundState({
    roundId: ids.round,
    serverSeedCommitment: hashes.server,
    now: startedAt,
    seedDeadline: deadline,
    participants: [
      { userId: ids.first, dealOrder: 0 },
      { userId: ids.second, dealOrder: 1 },
    ],
  })
}

function receipt(seedHashes: readonly { readonly userId: string; readonly seedHash: string }[]) {
  return {
    receiptVersion: FAIRNESS_PUBLIC_RECEIPT_VERSION,
    algorithmVersion: FAIRNESS_ALGORITHM_VERSION,
    roundId: ids.round,
    game: 'seotda',
    seedAudit: {
      protocol: 'commit-reveal',
      serverSeedCommitment: hashes.server,
      clientSeedHashes: seedHashes,
      finalSeedHash: 'e'.repeat(64),
      revealPolicy: 'after-round-finalized-authenticated-audit',
    },
    dealPlan: {
      game: 'seotda',
      participantCount: 2,
      deckSize: 20,
      privateCardsPerParticipant: 2,
      publicBoardStages: [],
      dealPlanCommitment: 'f'.repeat(64),
    },
    shuffledDeckCommitment: hashes.deck,
  } satisfies PublicFairnessReceipt
}

function expectCode(run: () => unknown, code: FairRoundStateError['code']) {
  try {
    run()
    throw new Error('Expected FairRoundStateError')
  } catch (error) {
    expect(error).toBeInstanceOf(FairRoundStateError)
    expect((error as FairRoundStateError).code).toBe(code)
  }
}

describe('fair round state machine', () => {
  it('starts only with a fixed complete seotda deal order', () => {
    const current = state()
    expect(current.phase).toBe('collecting_seeds')
    expect(current.participants.map((participant) => participant.dealOrder)).toEqual([0, 1])

    expectCode(
      () =>
        createFairRoundState({
          roundId: ids.round,
          serverSeedCommitment: hashes.server,
          now: startedAt,
          seedDeadline: deadline,
          participants: [
            { userId: ids.first, dealOrder: 0 },
            { userId: ids.second, dealOrder: 2 },
          ],
        }),
      'FAIR_ROUND_INVALID_INPUT',
    )
  })

  it('accepts one immutable client commitment and makes exact retries idempotent', () => {
    const submitted = submitFairRoundSeed(state(), {
      userId: ids.first,
      clientSeedHash: hashes.first,
      now: new Date('2026-07-24T12:00:01.000Z'),
    })
    const retried = submitFairRoundSeed(submitted, {
      userId: ids.first,
      clientSeedHash: hashes.first,
      now: new Date('2026-07-24T12:01:00.000Z'),
    })
    expect(retried).toBe(submitted)

    expectCode(
      () =>
        submitFairRoundSeed(submitted, {
          userId: ids.first,
          clientSeedHash: hashes.second,
          now: new Date('2026-07-24T12:00:02.000Z'),
        }),
      'FAIR_ROUND_SEED_CONFLICT',
    )
  })

  it('does not accept a new seed at deadline and seals missing users as timed out', () => {
    expectCode(
      () =>
        submitFairRoundSeed(state(), {
          userId: ids.first,
          clientSeedHash: hashes.first,
          now: deadline,
        }),
      'FAIR_ROUND_SEED_DEADLINE_REACHED',
    )

    const submitted = submitFairRoundSeed(state(), {
      userId: ids.first,
      clientSeedHash: hashes.first,
      now: new Date('2026-07-24T12:00:01.000Z'),
    })
    const sealed = sealFairRound(submitted, {
      now: deadline,
      publicReceipt: receipt([{ userId: ids.first, seedHash: hashes.first }]),
    })

    expect(sealed.phase).toBe('sealed')
    expect(sealed.participants[1]?.seedTimedOutAt).toEqual(deadline)
    expect(sealed.publicReceipt?.shuffledDeckCommitment).toBe(hashes.deck)
  })

  it('requires all commitments or a reached deadline, and binds the receipt to exact submissions', () => {
    const submitted = submitFairRoundSeed(state(), {
      userId: ids.first,
      clientSeedHash: hashes.first,
      now: new Date('2026-07-24T12:00:01.000Z'),
    })
    expectCode(
      () =>
        sealFairRound(submitted, {
          now: new Date('2026-07-24T12:00:02.000Z'),
          publicReceipt: receipt([{ userId: ids.first, seedHash: hashes.first }]),
        }),
      'FAIR_ROUND_SEED_DEADLINE_NOT_REACHED',
    )
    expectCode(
      () =>
        sealFairRound(submitted, {
          now: deadline,
          publicReceipt: receipt([{ userId: ids.second, seedHash: hashes.second }]),
        }),
      'FAIR_ROUND_INVALID_RECEIPT',
    )
  })

  it('permits early sealing after every seed and permits reveal only after round finalization', () => {
    const first = submitFairRoundSeed(state(), {
      userId: ids.first,
      clientSeedHash: hashes.first,
      now: new Date('2026-07-24T12:00:01.000Z'),
    })
    const complete = submitFairRoundSeed(first, {
      userId: ids.second,
      clientSeedHash: hashes.second,
      now: new Date('2026-07-24T12:00:02.000Z'),
    })
    const sealed = sealFairRound(complete, {
      now: new Date('2026-07-24T12:00:03.000Z'),
      publicReceipt: receipt([
        { userId: ids.first, seedHash: hashes.first },
        { userId: ids.second, seedHash: hashes.second },
      ]),
    })

    expectCode(
      () =>
        revealFairRound(sealed, {
          now: new Date('2026-07-24T12:00:04.000Z'),
          roundFinalized: false,
        }),
      'FAIR_ROUND_NOT_FINALIZED',
    )
    expect(
      revealFairRound(sealed, {
        now: new Date('2026-07-24T12:00:04.000Z'),
        roundFinalized: true,
      }).phase,
    ).toBe('revealed')
  })

  it('allows abortion only before a deal has been sealed', () => {
    const aborted = abortFairRound(state(), new Date('2026-07-24T12:00:03.000Z'), 'host canceled')
    expect(aborted).toMatchObject({ phase: 'aborted', abortReason: 'host canceled' })

    expectCode(
      () => abortFairRound(aborted, new Date('2026-07-24T12:00:04.000Z'), 'again'),
      'FAIR_ROUND_NOT_COLLECTING',
    )
  })
})
