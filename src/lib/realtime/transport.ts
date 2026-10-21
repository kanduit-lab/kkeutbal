import type { z } from 'zod'
import type { eventPayloads, EventName, Envelope, RoomEvent } from './events'

export type RealtimeRuntimeConfig =
  | { readonly mode: 'self' }
  | {
      readonly mode: 'supabase'
      readonly supabase: {
        readonly url: string
        readonly publishableKey: string
      }
    }

export type RealtimeConnectionStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED'

type EventPayload<K extends EventName> = z.infer<(typeof eventPayloads)[K]>

export interface RoomRealtimeConnection {
  start(): void
  send<K extends EventName>(name: K, payload: EventPayload<K>): Promise<boolean>
  close(): Promise<void>
  onStatus(handler: (status: RealtimeConnectionStatus) => void): void
  onEvent(handler: (event: RoomEvent, envelope: Envelope) => void): void
  onPresence(handler: (userIds: ReadonlySet<string>) => void): void
  track(presence: { readonly userId: string; readonly displayName: string }): Promise<void>
}
