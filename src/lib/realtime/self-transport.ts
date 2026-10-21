'use client'

import { eventPayloads, parseEvent, type EventName, type Envelope, type RoomEvent } from './events'
import type { RoomRealtimeConnection } from './transport'
import type { z } from 'zod'

type EventPayload<K extends EventName> = z.infer<(typeof eventPayloads)[K]>

export function createSelfRoomConnection(
  roomId: string,
  includePresence: boolean,
): RoomRealtimeConnection {
  const statusHandlers = new Set<
    (status: 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED') => void
  >()
  const eventHandlers = new Set<(event: RoomEvent, envelope: Envelope) => void>()
  const presenceHandlers = new Set<(userIds: ReadonlySet<string>) => void>()
  let source: EventSource | null = null
  let closed = false
  const sourceId = crypto.randomUUID()
  const query = new URLSearchParams({ source: sourceId })
  if (!includePresence) query.set('presence', '0')
  const endpoint = `/api/realtime/rooms/${encodeURIComponent(roomId)}?${query.toString()}`

  function notifyStatus(status: 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED') {
    for (const handler of statusHandlers) handler(status)
  }

  return {
    start() {
      if (source || closed) return
      source = new EventSource(endpoint)
      source.addEventListener('ready', () => notifyStatus('SUBSCRIBED'))
      source.addEventListener('room', (message) => {
        const parsed = parseJson(message)
        if (
          !isRecord(parsed) ||
          typeof parsed.name !== 'string' ||
          !Object.hasOwn(eventPayloads, parsed.name)
        )
          return
        const name = parsed.name as EventName
        const event = parseEvent(name, parsed.envelope)
        if (!event || event.envelope.roomId !== roomId) return
        for (const handler of eventHandlers) {
          handler({ name, payload: event.payload } as RoomEvent, event.envelope)
        }
      })
      source.addEventListener('presence', (message) => {
        const parsed = parseJson(message)
        if (!isRecord(parsed) || !Array.isArray(parsed.userIds) || !parsed.userIds.every(isString))
          return
        const userIds = new Set(parsed.userIds)
        for (const handler of presenceHandlers) handler(userIds)
      })
      source.onerror = () => {
        if (closed) return
        source?.close()
        source = null
        notifyStatus('CHANNEL_ERROR')
      }
    },
    async send<K extends EventName>(name: K, payload: EventPayload<K>): Promise<boolean> {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sourceId, name, payload }),
        })
        if (response.status !== 202) return false
        const body = await response.json().catch(() => null)
        return isRecord(body) && body.delivered === true
      } catch (error) {
        console.error(`realtime self send threw (${name}):`, error)
        return false
      }
    },
    async close() {
      closed = true
      source?.close()
      source = null
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
    async track() {},
  }
}

function parseJson(message: Event): unknown {
  if (!(message instanceof MessageEvent) || typeof message.data !== 'string') return null
  try {
    return JSON.parse(message.data)
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}
