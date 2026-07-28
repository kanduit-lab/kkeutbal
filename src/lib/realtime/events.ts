import { z } from 'zod'

export const PROTOCOL_VERSION = 1 as const

export function roomTopic(roomId: string): string {
  return `room:${roomId}`
}

const uuid = z.string().uuid()

export const envelopeSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  id: uuid,
  roomId: uuid,
  actorId: uuid,
  at: z.string().datetime(),
})

export type Envelope = z.infer<typeof envelopeSchema>

export const betActionSchema = z.enum(['check', 'call', 'raise', 'fold', 'allin'])

export const chipReasonSchema = z.enum(['buy_in', 'bet', 'pot_win', 'correction', 'settlement'])

const chipAmount = z.number().int().nonnegative()

export const eventPayloads = {
  'member.joined': z.object({
    userId: uuid,
    displayName: z.string().min(1).max(40),
    role: z.enum(['host', 'dealer', 'player', 'observer']),
    seatNo: z.number().int().min(0).max(9),
  }),
  'member.role_changed': z.object({
    userId: uuid,
    role: z.enum(['host', 'dealer', 'player', 'observer']),
  }),
  'member.left': z.object({
    userId: uuid,
  }),
  'room.settings_changed': z.object({}).passthrough(),
  'round.started': z.object({
    roundId: uuid,
    seq: z.number().int().positive(),
  }),
  'round.ended': z.object({
    roundId: uuid,
    seq: z.number().int().positive(),
    winnerId: uuid.nullable(),
    pot: chipAmount,
  }),
  'round.voided': z.object({
    roundId: uuid,
    seq: z.number().int().nonnegative(),
    reason: z.string().min(1).max(200),
  }),
  'bet.placed': z.object({
    actionId: uuid,
    roundId: uuid,
    action: betActionSchema,
    amount: chipAmount,
    seq: z.number().int().nonnegative(),
  }),
  'bet.approved': z.object({
    actionId: uuid,
    approvedBy: uuid,
  }),
  'bet.rejected': z.object({
    actionId: uuid,
    rejectedBy: uuid,
    reason: z.string().min(1).max(200),
  }),
  'bet.reverted': z.object({
    actionId: uuid,
    revertedBy: uuid,
    reason: z.string().min(1).max(200),
  }),
  'chips.updated': z.object({
    roundId: uuid.nullable(),
    reason: chipReasonSchema,
    deltas: z
      .array(
        z.object({
          userId: uuid,
          delta: z.number().int(),
          balance: chipAmount,
        }),
      )
      .min(1),
  }),
  'state.request': z.object({
    sinceSeq: z.number().int().nonnegative().nullable(),
  }),
  'state.snapshot': z.object({
    roomStatus: z.enum(['waiting', 'playing', 'settled', 'closed']),
    currentRound: z
      .object({ roundId: uuid, seq: z.number().int().positive(), pot: chipAmount })
      .nullable(),
    balances: z.array(z.object({ userId: uuid, balance: chipAmount })),
  }),
} as const

export type EventName = keyof typeof eventPayloads

export type RoomEvent = {
  [K in EventName]: { name: K; payload: z.infer<(typeof eventPayloads)[K]> }
}[EventName]

export function parseEvent<K extends EventName>(
  name: K,
  raw: unknown,
): { envelope: Envelope; payload: z.infer<(typeof eventPayloads)[K]> } | null {
  const schema = envelopeSchema.extend({ payload: eventPayloads[name] })
  const result = schema.safeParse(raw)
  if (!result.success) return null

  const { payload, ...envelope } = result.data
  return { envelope, payload: payload as z.infer<(typeof eventPayloads)[K]> }
}