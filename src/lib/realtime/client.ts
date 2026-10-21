'use client'

import { disconnectSupabaseBrowser } from '../supabase/client'
import { eventPayloads, type EventName } from './events'
import { createSelfRoomConnection } from './self-transport'
import { createSupabaseRoomConnection } from './supabase-transport'
import type { RealtimeRuntimeConfig, RoomRealtimeConnection } from './transport'
import { z } from 'zod'

const runtimeConfigSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('self') }),
  z.object({
    mode: z.literal('supabase'),
    supabase: z.object({ url: z.string().url(), publishableKey: z.string().min(1) }),
  }),
])

type EventPayload<K extends EventName> = z.infer<(typeof eventPayloads)[K]>

export async function createRoomConnection(
  roomId: string,
  userId: string,
  options: { readonly includePresence?: boolean } = {},
): Promise<RoomRealtimeConnection> {
  const config = await fetchRuntimeConfig()
  if (config.mode === 'self')
    return createSelfRoomConnection(roomId, options.includePresence !== false)
  return createSupabaseRoomConnection(config, roomId, userId)
}

export async function sendOneShotRoomEvent<K extends EventName>(
  roomId: string,
  selfId: string,
  name: K,
  payload: EventPayload<K>,
): Promise<boolean> {
  let connection: RoomRealtimeConnection | null = null
  try {
    connection = await createRoomConnection(roomId, selfId, { includePresence: false })
    return await connection.send(name, payload)
  } catch (error) {
    console.error(`realtime one-shot send failed (${name}):`, error)
    return false
  } finally {
    await connection?.close()
  }
}

export function resetRealtimeSocket(): void {
  disconnectSupabaseBrowser()
}

export async function sendRoomEvent<K extends EventName>(
  connection: RoomRealtimeConnection,
  name: K,
  payload: EventPayload<K>,
): Promise<boolean> {
  return connection.send(name, payload)
}

async function fetchRuntimeConfig(): Promise<RealtimeRuntimeConfig> {
  const response = await fetch('/api/realtime/config', {
    cache: 'no-store',
    credentials: 'same-origin',
  })
  if (!response.ok) throw new Error(`Realtime config request failed: ${response.status}`)

  const parsed = runtimeConfigSchema.safeParse(await response.json())
  if (!parsed.success) throw new Error('Realtime config response is invalid')
  return parsed.data
}
