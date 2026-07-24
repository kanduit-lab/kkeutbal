import { describe, expect, it } from 'vitest'
import { PROTOCOL_VERSION, parseEvent } from './events'

const ENVELOPE = {
  v: PROTOCOL_VERSION,
  id: '00000000-0000-4000-8000-000000000001',
  roomId: '00000000-0000-4000-8000-000000000002',
  actorId: '00000000-0000-4000-8000-000000000003',
  at: '2026-07-24T12:00:00.000Z',
} as const

describe('parseEvent', () => {
  it('accepts a valid event envelope and matching payload', () => {
    const parsed = parseEvent('bet.placed', {
      ...ENVELOPE,
      payload: {
        actionId: '00000000-0000-4000-8000-000000000004',
        roundId: '00000000-0000-4000-8000-000000000005',
        action: 'raise',
        amount: 25,
        seq: 3,
      },
    })

    expect(parsed).toMatchObject({
      envelope: ENVELOPE,
      payload: { action: 'raise', amount: 25 },
    })
  })

  it('rejects a payload from a different protocol version', () => {
    expect(
      parseEvent('round.started', {
        ...ENVELOPE,
        v: 2,
        payload: { roundId: '00000000-0000-4000-8000-000000000005', seq: 1 },
      }),
    ).toBeNull()
  })

  it('rejects malformed untrusted action payloads', () => {
    expect(
      parseEvent('bet.placed', {
        ...ENVELOPE,
        payload: {
          actionId: '00000000-0000-4000-8000-000000000004',
          roundId: '00000000-0000-4000-8000-000000000005',
          action: 'teleport',
          amount: -1,
          seq: 3,
        },
      }),
    ).toBeNull()
  })
})
