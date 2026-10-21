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
import type {
  RealtimeConnectionStatus,
  RealtimeRuntimeConfig,
  RoomRealtimeConnection,
} from './transport'
import type { z } from 'zod'

type EventPayload<K extends EventName> = z.infer<(typeof eventPayloads)[K]>

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

export function createSupabaseRoomConnection(
  config: Extract<RealtimeRuntimeConfig, { mode: 'supabase' }>,
  roomId: string,
  userId: string,
): RoomRealtimeConnection {
  const supabase = getSupabaseBrowser(config.supabase)
  const channel = supabase.channel(roomTopic(roomId), {
    config: {
      broadcast: { self: false, ack: true },
      presence: { key: userId },
    },
  })
  const statusHandlers = new Set<(status: RealtimeConnectionStatus) => void>()
  const eventHandlers = new Set<(event: RoomEvent, envelope: Envelope) => void>()
  const presenceHandlers = new Set<(userIds: ReadonlySet<string>) => void>()

  function notifyStatus(status: RealtimeConnectionStatus) {
    for (const handler of statusHandlers) handler(status)
  }

  function sendWithRetry<K extends EventName>(name: K, payload: EventPayload<K>): Promise<boolean> {
    const envelope = buildEnvelope(roomId, userId, payload)
    return retrySend(channel, name, envelope)
  }

  return {
    start() {
      for (const name of Object.keys(eventPayloads) as EventName[]) {
        channel.on('broadcast', { event: name }, (message) => {
          const parsed = parseEvent(name, message.payload)
          if (!parsed || parsed.envelope.roomId !== roomId) return
          for (const handler of eventHandlers) {
            handler({ name, payload: parsed.payload } as RoomEvent, parsed.envelope)
          }
        })
      }
      channel.on('presence', { event: 'sync' }, () => {
        const userIds = new Set(Object.keys(channel.presenceState()))
        for (const handler of presenceHandlers) handler(userIds)
      })
      channel.subscribe((status) => {
        if (
          status === 'SUBSCRIBED' ||
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          notifyStatus(status)
        }
      })
    },
    send: sendWithRetry,
    async close() {
      await supabase.removeChannel(channel)
    },
    onStatus(handler) {
      statusHandlers.add(handler)
    },
    onEvent(handler) {
      eventHandlers.add(handler)
    },
    onPresence(handler) {
      presenceHandlers.add(handler)
    },
    async track(presence) {
      const status = await channel.track(presence)
      if (status !== 'ok') throw new Error(`Supabase presence track failed: ${status}`)
    },
  }
}

async function retrySend(
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
