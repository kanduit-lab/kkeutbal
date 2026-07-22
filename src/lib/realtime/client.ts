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
} from './events'
import type { z } from 'zod'

/**
 * 방 채널 헬퍼.
 *
 * 이벤트는 "행동한 클라이언트"가 Server Action 성공 후 직접 쏜다.
 * 수신자는 payload 를 화면 힌트로만 쓰고, 진실은 스냅샷 refetch 로 맞춘다.
 */

export interface RoomPresenceMeta {
  userId: string
  displayName: string
}

export function createRoomChannel(roomId: string, userId: string): RealtimeChannel {
  const supabase = getSupabaseBrowser()
  return supabase.channel(roomTopic(roomId), {
    config: {
      broadcast: { self: false },
      presence: { key: userId },
    },
  })
}

/** 검증 통과한 이벤트만 handler 에 전달한다. 실패 payload 는 조용히 버린다. */
export function onRoomEvent(
  channel: RealtimeChannel,
  handler: (
    name: EventName,
    envelope: Envelope,
    payload: z.infer<(typeof eventPayloads)[EventName]>,
  ) => void,
): void {
  for (const name of Object.keys(eventPayloads) as EventName[]) {
    channel.on('broadcast', { event: name }, (message) => {
      const parsed = parseEvent(name, message.payload)
      if (!parsed) return
      handler(name, parsed.envelope, parsed.payload)
    })
  }
}

/** 행동한 클라이언트가 성공 확정 후 호출한다. */
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
