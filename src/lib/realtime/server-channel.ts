import 'server-only'

import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { createListenerSql, db, schema } from '@/lib/db'
import {
  PROTOCOL_VERSION,
  eventPayloads,
  parseEvent,
  type Envelope,
  type EventName,
  type RoomEvent,
} from './events'

const REALTIME_CHANNEL = 'kkeutbal_realtime'
const MAX_NOTIFICATION_BYTES = 7_500
const uuid = z.string().uuid()

export type RoomNotification =
  | {
      readonly kind: 'event'
      readonly roomId: string
      readonly sourceId: string
      readonly event: RoomEvent
      readonly envelope: Envelope
    }
  | { readonly kind: 'presence'; readonly roomId: string }

type Subscriber = (notification: RoomNotification) => void

interface RealtimeHubState {
  readonly subscribers: Set<Subscriber>
  listener?: Promise<void>
}

const globalForRealtime = globalThis as unknown as { kkeutbalRealtimeHub?: RealtimeHubState }
const hub = (globalForRealtime.kkeutbalRealtimeHub ??= { subscribers: new Set<Subscriber>() })

function parseNotification(value: string): RoomNotification | null {
  let raw: unknown
  try {
    raw = JSON.parse(value)
  } catch {
    return null
  }

  const base = z
    .object({
      kind: z.enum(['event', 'presence']),
      roomId: uuid,
      name: z.string().optional(),
      sourceId: uuid.optional(),
      envelope: z.unknown().optional(),
    })
    .safeParse(raw)
  if (!base.success) return null
  if (base.data.kind === 'presence') return { kind: 'presence', roomId: base.data.roomId }
  if (
    !base.data.name ||
    !base.data.sourceId ||
    !base.data.envelope ||
    !Object.hasOwn(eventPayloads, base.data.name)
  ) {
    return null
  }

  const name = base.data.name as EventName
  const parsed = parseEvent(name, base.data.envelope)
  if (!parsed || parsed.envelope.roomId !== base.data.roomId) return null
  return {
    kind: 'event',
    roomId: base.data.roomId,
    sourceId: base.data.sourceId,
    event: { name, payload: parsed.payload } as RoomEvent,
    envelope: parsed.envelope,
  }
}

function dispatch(value: string): void {
  const notification = parseNotification(value)
  if (!notification) return

  for (const subscriber of hub.subscribers) {
    try {
      subscriber(notification)
    } catch (error) {
      console.error('realtime subscriber failed:', error)
    }
  }
}

async function ensureListener(): Promise<void> {
  if (!hub.listener) {
    hub.listener = createListenerSql()
      .listen(REALTIME_CHANNEL, dispatch)
      .then(() => undefined)
      .catch((error: unknown) => {
        hub.listener = undefined
        throw error
      })
  }
  await hub.listener
}

export async function initializeRealtimeListener(): Promise<void> {
  await db.select({ id: schema.roomConnections.id }).from(schema.roomConnections).limit(0)
  await ensureListener()
}

async function notify(notification: unknown): Promise<void> {
  const payload = JSON.stringify(notification)
  if (Buffer.byteLength(payload, 'utf8') > MAX_NOTIFICATION_BYTES) {
    throw new Error('Realtime notification exceeds the PostgreSQL payload limit')
  }
  await db.execute(sql`select pg_notify(${REALTIME_CHANNEL}, ${payload})`)
}

export async function subscribeRoomNotifications(
  roomId: string,
  subscriber: Subscriber,
): Promise<() => void> {
  await ensureListener()
  const filtered: Subscriber = (notification) => {
    if (notification.roomId === roomId) subscriber(notification)
  }
  hub.subscribers.add(filtered)
  return () => hub.subscribers.delete(filtered)
}

export async function publishRoomEvent(
  roomId: string,
  actorId: string,
  sourceId: string,
  event: RoomEvent,
): Promise<void> {
  const envelope = {
    v: PROTOCOL_VERSION,
    id: randomUUID(),
    roomId,
    actorId,
    at: new Date().toISOString(),
    payload: event.payload,
  }
  await notify({ kind: 'event', roomId, sourceId, name: event.name, envelope })
}

export async function publishPresenceChanged(roomId: string): Promise<void> {
  await notify({ kind: 'presence', roomId })
}
