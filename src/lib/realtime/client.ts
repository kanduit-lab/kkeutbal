'use client'

import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabaseBrowser } from '../supabase/client'
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
      broadcast: { self: false },
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

export async function sendOneShotRoomEvent(
  roomId: string,
  selfId: string,
  name: EventName,
  payload: unknown,
): Promise<void> {
  const supabase = getSupabaseBrowser()
  const channel = createRoomChannel(roomId, selfId)
  try {
    await channel.send({
      type: 'broadcast',
      event: name,
      payload: {
        v: PROTOCOL_VERSION,
        id: crypto.randomUUID(),
        roomId,
        actorId: selfId,
        at: new Date().toISOString(),
        payload,
      },
    })
  } catch {
  } finally {
    void supabase.removeChannel(channel)
  }
}

export function resetRealtimeSocket(): void {
  getSupabaseBrowser().realtime.disconnect()
}

export function sendRoomEvent<K extends EventName>(
  channel: RealtimeChannel,
  roomId: string,
  actorId: string,
  name: K,
  payload: z.infer<(typeof eventPayloads)[K]>,
): void {
  void channel.send({
    type: 'broadcast',
    event: name,
    payload: {
      v: PROTOCOL_VERSION,
      id: crypto.randomUUID(),
      roomId,
      actorId,
      at: new Date().toISOString(),
      payload,
    },
  })
}