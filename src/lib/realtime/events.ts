import { z } from 'zod'

/**
 * 실시간 이벤트 스키마.
 *
 * 수신 payload 는 신뢰 경계 밖이다 — 파싱에 실패하면 상태에 반영하지 않고 버린다.
 * 버려도 `state.snapshot` 경로로 복구된다.
 */

export const PROTOCOL_VERSION = 1 as const

/** 방 채널 토픽. `realtime.messages` RLS 정책이 이 이름을 기준으로 권한을 판정한다. */
export function roomTopic(roomId: string): string {
  return `room:${roomId}`
}

const uuid = z.string().uuid()

/** 모든 이벤트 공통 봉투. `v` 는 프로토콜 버전 — 값이 다르면 파싱이 실패한다. */
export const envelopeSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  id: uuid,
  roomId: uuid,
  actorId: uuid,
  at: z.string().datetime(),
})

export type Envelope = z.infer<typeof envelopeSchema>

export const betActionSchema = z.enum(['check', 'call', 'raise', 'fold', 'allin'])

export const chipReasonSchema = z.enum([
  'buy_in',
  'bet',
  'pot_win',
  'correction',
  'settlement',
])

/** 칩 금액은 정수만 허용한다 — 부동소수 반올림 오차 차단. */
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

  /** 퇴장 알림. 진실은 refetch — payload 는 "누가 나갔다" 힌트뿐이다. */
  'member.left': z.object({
    userId: uuid,
  }),

  /** 방 옵션 변경 알림. 수신자는 어차피 refetch 하므로 내용은 싣지 않는다. */
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
    /** 사유는 필수다. 사유 없는 무효 처리는 분쟁을 만든다. */
    reason: z.string().min(1).max(200),
  }),

  'bet.placed': z.object({
    actionId: uuid,
    roundId: uuid,
    action: betActionSchema,
    amount: chipAmount,
    /** 클라이언트 추정 순번. 진실은 서버가 커밋 시 확정한다. */
    seq: z.number().int().nonnegative(),
  }),

  'bet.approved': z.object({
    actionId: uuid,
    approvedBy: uuid,
  }),

  'bet.rejected': z.object({
    actionId: uuid,
    rejectedBy: uuid,
    /** 사유는 필수다. 사유 없는 거절은 분쟁을 만든다. */
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
    /** 클라이언트가 마지막으로 반영한 판 번호. 서버가 필요한 만큼만 보낸다. */
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

/**
 * 이름과 payload 가 짝으로 좁혀지는 판별 유니온.
 * 수신 측이 `event.name === 'bet.placed'` 분기만으로 payload 타입을 캐스트 없이 얻는다.
 */
export type RoomEvent = {
  [K in EventName]: { name: K; payload: z.infer<(typeof eventPayloads)[K]> }
}[EventName]

/** 이벤트 이름 + 봉투 + payload 를 한 번에 검증한다. */
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
