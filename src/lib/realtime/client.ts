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

/**
 * 방 채널 헬퍼.
 *
 * 이벤트는 "행동한 클라이언트"가 Server Action 성공 후 직접 쏜다.
 * 수신자는 payload 를 화면 힌트로만 쓰고, 진실은 스냅샷 refetch 로 맞춘다.
 */

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
  roomId: string,
  handler: (event: RoomEvent, envelope: Envelope) => void,
): void {
  for (const name of Object.keys(eventPayloads) as EventName[]) {
    channel.on('broadcast', { event: name }, (message) => {
      const parsed = parseEvent(name, message.payload)
      if (!parsed) return
      // 공개 채널의 envelope 는 신뢰 경계 밖이다. 구독 토픽과 다른 방 이벤트는
      // refetch·효과음·오류 토스트의 힌트로도 쓰지 않는다.
      if (parsed.envelope.roomId !== roomId) return
      // parseEvent 가 name 별 스키마로 검증했으므로 name-payload 짝은 정확하다.
      // 루프 변수 name 이 유니온으로 넓혀져 상관관계를 잃은 것뿐이라 캐스트가 안전하다.
      handler({ name, payload: parsed.payload } as RoomEvent, parsed.envelope)
    })
  }
}

/**
 * 구독 중인 채널이 없는 화면(설정 페이지, 퇴장 직전 등)에서 이벤트 하나만 쏘고 끝낸다.
 *
 * supabase-js 는 미구독 채널의 send 를 REST 로 보내므로 웹소켓 구독이 필요 없다.
 * 브로드캐스트는 힌트일 뿐이라 실패는 조용히 삼킨다 — 수신자는 폴링으로 어차피 복구된다.
 */
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
    // 힌트 유실 허용 — 진실은 스냅샷 refetch 가 맞춘다.
  } finally {
    void supabase.removeChannel(channel)
  }
}

/**
 * Realtime 웹소켓을 끊는다 — 다음 구독이 새 소켓을 연다.
 * 소켓이 죽었는데 라이브러리가 살아있다고 믿는 상태(절전 복귀 등)에서 수동 재접속 직전에 쓴다.
 */
export function resetRealtimeSocket(): void {
  getSupabaseBrowser().realtime.disconnect()
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
