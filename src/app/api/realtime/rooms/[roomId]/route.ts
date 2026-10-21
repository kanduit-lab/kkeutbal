import { NextResponse } from 'next/server'
import { z } from 'zod'
import { currentUserId } from '@/features/auth/session'
import { getMemberRole } from '@/features/game/queries'
import { serverEnv } from '@/lib/env'
import { consumeRateLimitsUnlessAdmin } from '@/lib/rate-limit'
import { parseRoomEvent } from '@/lib/realtime/events'
import {
  listOnlineRoomUserIds,
  PRESENCE_HEARTBEAT_MS,
  registerRoomConnection,
  removeRoomConnection,
  renewRoomConnection,
} from '@/lib/realtime/presence'
import {
  publishPresenceChanged,
  publishRoomEvent,
  subscribeRoomNotifications,
  type RoomNotification,
} from '@/lib/realtime/server-channel'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const roomIdSchema = z.string().uuid()
const encoder = new TextEncoder()
const MAX_EVENT_BODY_BYTES = 16_384

interface RouteContext {
  readonly params: Promise<{ roomId: string }>
}

async function authorizedRoomUser(
  context: RouteContext,
): Promise<{ roomId: string; userId: string } | NextResponse> {
  const roomId = roomIdSchema.safeParse((await context.params).roomId)
  if (!roomId.success) return NextResponse.json({ error: 'invalid_room' }, { status: 400 })

  const userId = await currentUserId()
  if (!userId) return NextResponse.json({ error: 'authentication_required' }, { status: 401 })
  if (!(await getMemberRole(roomId.data, userId))) {
    return NextResponse.json({ error: 'room_membership_required' }, { status: 403 })
  }
  return { roomId: roomId.data, userId }
}

function sse(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

function hasAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  return origin === null || origin === new URL(serverEnv().NEXT_PUBLIC_APP_URL).origin
}

async function readEventBody(
  request: Request,
): Promise<{ readonly value: unknown } | { readonly error: 'event_too_large' | 'invalid_json' }> {
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_EVENT_BODY_BYTES) {
    return { error: 'event_too_large' }
  }
  if (!request.body) return { error: 'invalid_json' }

  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let body = ''
  let size = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_EVENT_BODY_BYTES) {
      await reader.cancel()
      return { error: 'event_too_large' }
    }
    body += decoder.decode(value, { stream: true })
  }

  try {
    return { value: JSON.parse(body + decoder.decode()) as unknown }
  } catch {
    return { error: 'invalid_json' }
  }
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  if (serverEnv().REALTIME_MODE !== 'self') {
    return NextResponse.json({ error: 'self_realtime_disabled' }, { status: 404 })
  }

  const access = await authorizedRoomUser(context)
  if (access instanceof NextResponse) return access

  const searchParams = new URL(request.url).searchParams
  const sourceId = z.string().uuid().safeParse(searchParams.get('source'))
  if (!sourceId.success) {
    return NextResponse.json({ error: 'invalid_source' }, { status: 400 })
  }
  const trackPresence = searchParams.get('presence') !== '0'
  let connectionId: string | null = null
  let unsubscribe: (() => void) | null = null
  let receiveNotification = (_notification: RoomNotification): void => undefined

  try {
    unsubscribe = await subscribeRoomNotifications(access.roomId, (notification) => {
      receiveNotification(notification)
    })
    if (trackPresence) {
      connectionId = await registerRoomConnection(access.roomId, access.userId)
    }
  } catch (error) {
    console.error('realtime subscription setup failed:', error)
    return NextResponse.json({ error: 'realtime_unavailable' }, { status: 503 })
  }

  let closeStream: (() => Promise<void>) | null = null
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      let heartbeatBusy = false

      const sendPresence = async () => {
        const userIds = await listOnlineRoomUserIds(access.roomId)
        if (!closed) controller.enqueue(sse('presence', { userIds }))
      }

      receiveNotification = (notification) => {
        if (closed) return
        if (notification.kind === 'event') {
          if (notification.sourceId === sourceId.data) return
          controller.enqueue(
            sse('room', { name: notification.event.name, envelope: notification.envelope }),
          )
          return
        }
        void sendPresence().catch((error: unknown) => {
          console.error('realtime presence refresh failed:', error)
        })
      }

      const heartbeat = setInterval(() => {
        if (closed || heartbeatBusy) return
        heartbeatBusy = true
        void (async () => {
          if (connectionId) await renewRoomConnection(connectionId)
          await sendPresence()
          if (!closed) controller.enqueue(sse('ping', { at: new Date().toISOString() }))
        })()
          .catch((error: unknown) => {
            console.error('realtime heartbeat failed:', error)
            void closeStream?.().finally(() => {
              if (!request.signal.aborted) {
                controller.error(new Error('Realtime heartbeat failed'))
              }
            })
          })
          .finally(() => {
            heartbeatBusy = false
          })
      }, PRESENCE_HEARTBEAT_MS)

      closeStream = async () => {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        unsubscribe?.()
        unsubscribe = null
        if (connectionId) {
          try {
            await removeRoomConnection(connectionId)
            await publishPresenceChanged(access.roomId)
          } catch (error) {
            console.error('realtime presence cleanup failed:', error)
          }
        }
      }

      controller.enqueue(sse('ready', {}))
      void sendPresence().catch((error: unknown) => console.error('initial presence failed:', error))
      if (connectionId) {
        void publishPresenceChanged(access.roomId).catch((error: unknown) => {
          console.error('presence announcement failed:', error)
        })
      }
      request.signal.addEventListener('abort', () => void closeStream?.(), { once: true })
    },
    cancel() {
      return closeStream?.()
    },
  })

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Accel-Buffering': 'no',
    },
  })
}

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  if (serverEnv().REALTIME_MODE !== 'self') {
    return NextResponse.json({ error: 'self_realtime_disabled' }, { status: 404 })
  }
  if (!hasAllowedOrigin(request)) {
    return NextResponse.json({ error: 'invalid_origin' }, { status: 403 })
  }

  const access = await authorizedRoomUser(context)
  if (access instanceof NextResponse) return access

  const body = await readEventBody(request)
  if ('error' in body) {
    const status = body.error === 'event_too_large' ? 413 : 400
    return NextResponse.json({ error: body.error }, { status })
  }
  const event = parseRoomEvent(body.value)
  if (!event) return NextResponse.json({ error: 'invalid_event' }, { status: 400 })
  const sourceId = z
    .object({ sourceId: z.string().uuid() })
    .safeParse(body.value)
  if (!sourceId.success) return NextResponse.json({ error: 'invalid_source' }, { status: 400 })

  let rateLimit
  try {
    rateLimit = await consumeRateLimitsUnlessAdmin(access.userId, [
      {
        scope: 'realtime.publish.user.minute',
        identifier: access.userId,
        limit: 180,
        windowMs: 60_000,
      },
    ])
  } catch (error) {
    console.error('realtime rate limit failed:', error)
    return NextResponse.json({ error: 'realtime_unavailable' }, { status: 503 })
  }
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
    )
  }

  try {
    await publishRoomEvent(access.roomId, access.userId, sourceId.data.sourceId, event)
    return NextResponse.json({ delivered: true }, { status: 202 })
  } catch (error) {
    console.error('realtime publish failed:', error)
    return NextResponse.json({ error: 'realtime_unavailable' }, { status: 503 })
  }
}
