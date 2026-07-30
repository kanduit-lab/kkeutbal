'use client'

import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabaseBrowser } from '../supabase/client'
import { MAX_SEND_ATTEMPTS, sendRetryDelayMs } from './send-retry'
import {
  PROTOCOL_VERSION,
  eventPayloads,
  parseEvent,
  roomTopic,
  type EventName,
  type Envelope,
  type RoomEvent,
} from './events'
import type { z } from 'zod'

export function createRoomChannel(roomId: string, userId: string): RealtimeChannel {
  const supabase = getSupabaseBrowser()
  return supabase.channel(roomTopic(roomId), {
    config: {
      // ack: true — 이게 없으면 조인된 채널에서 send()가 서버 확인 없이 즉시
      // 'ok'를 돌려준다. 소켓이 살아 있는 척하면서 패킷이 버려지는 모바일
      // 구간을 잡으려면 실제 확인이 필요하다. 재시도가 중복 배달을 만들어도
      // envelope id dedup(seen-events.ts)이 흡수한다.
      broadcast: { self: false, ack: true },
      presence: { key: userId },
    },
  })
}

export function onRoomEvent(
  channel: RealtimeChannel,
  roomId: string,
  handler: (event: RoomEvent, envelope: Envelope) => void,
): void {
  for (const name of Object.keys(eventPayloads) as EventName[]) {
    channel.on('broadcast', { event: name }, (message) => {
      const parsed = parseEvent(name, message.payload)
      if (!parsed) return

      if (parsed.envelope.roomId !== roomId) return

      handler({ name, payload: parsed.payload } as RoomEvent, parsed.envelope)
    })
  }
}

function buildEnvelope(roomId: string, actorId: string, payload: unknown) {
  return {
    v: PROTOCOL_VERSION,
    id: crypto.randomUUID(),
    roomId,
    actorId,
    at: new Date().toISOString(),
    payload,
  }
}

/**
 * Sends one broadcast, retrying up to `MAX_SEND_ATTEMPTS` times on failure.
 *
 * The protocol doesn't enable `broadcast.ack` (docs/03-realtime-protocol.md),
 * so `channel.send()` resolves `'ok'` immediately for an already-joined
 * channel — there's no server confirmation to wait for, and no signal to
 * retry on. The one case this genuinely detects is the channel not being
 * joined at send time (socket mid-reconnect): supabase-js then falls back to
 * a real REST POST and resolves with its actual outcome. That's exactly the
 * "socket dropped, event vanished" scenario this retry loop targets.
 *
 * All attempts reuse the same envelope id, so a retry landing after an
 * earlier attempt actually succeeded is a harmless duplicate — receivers
 * dedupe feedback by envelope id (`seen-events.ts`); the snapshot refetch
 * they run either way doesn't care.
 */
async function sendWithRetry(
  channel: RealtimeChannel,
  name: EventName,
  envelope: ReturnType<typeof buildEnvelope>,
): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_SEND_ATTEMPTS; attempt++) {
    try {
      const status = await channel.send({ type: 'broadcast', event: name, payload: envelope })
      if (status === 'ok') return true
    } catch (error) {
      console.error(`realtime send threw (${name}):`, error)
    }
    if (attempt < MAX_SEND_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, sendRetryDelayMs(attempt)))
    }
  }
  console.error(
    `realtime send gave up on "${name}" after ${MAX_SEND_ATTEMPTS} attempts — other participants will only catch up on their next poll`,
  )
  return false
}

/**
 * Fires a broadcast from a screen with no subscribed channel (settings save,
 * leave-room). Never subscribed means `channel.send()` always takes the REST
 * fallback path, so every attempt here gets a genuine ok/error/timed-out
 * result — retries are real network retries, not guesswork.
 */
export async function sendOneShotRoomEvent(
  roomId: string,
  selfId: string,
  name: EventName,
  payload: unknown,
): Promise<boolean> {
  const supabase = getSupabaseBrowser()
  const channel = createRoomChannel(roomId, selfId)
  try {
    return await sendWithRetry(channel, name, buildEnvelope(roomId, selfId, payload))
  } finally {
    void supabase.removeChannel(channel)
  }
}

export function resetRealtimeSocket(): void {
  getSupabaseBrowser().realtime.disconnect()
}

/**
 * Sends a broadcast on an already-subscribed channel. Returns whether
 * delivery is believed to have succeeded (see `sendWithRetry`) — `false`
 * after retries are exhausted, which the caller (`room-client.tsx`'s
 * `afterMutation`) surfaces to the acting user as "this may not have reached
 * everyone yet". Receivers still treat the event as a hint only; truth comes
 * from their own snapshot refetch, per docs/03-realtime-protocol.md.
 */
export async function sendRoomEvent<K extends EventName>(
  channel: RealtimeChannel,
  roomId: string,
  actorId: string,
  name: K,
  payload: z.infer<(typeof eventPayloads)[K]>,
): Promise<boolean> {
  return sendWithRetry(channel, name, buildEnvelope(roomId, actorId, payload))
}