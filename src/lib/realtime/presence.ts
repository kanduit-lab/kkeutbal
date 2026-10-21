import 'server-only'

import { and, eq, gt, lt } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

export const PRESENCE_HEARTBEAT_MS = 15_000
const PRESENCE_LEASE_MS = 45_000

function leaseExpiry(now: Date): Date {
  return new Date(now.getTime() + PRESENCE_LEASE_MS)
}

export async function registerRoomConnection(
  roomId: string,
  userId: string,
  now = new Date(),
): Promise<string> {
  await db.delete(schema.roomConnections).where(lt(schema.roomConnections.expiresAt, now))

  const [connection] = await db
    .insert(schema.roomConnections)
    .values({ roomId, userId, expiresAt: leaseExpiry(now), updatedAt: now })
    .returning({ id: schema.roomConnections.id })

  if (!connection) throw new Error('Failed to register realtime room connection')
  return connection.id
}

export async function renewRoomConnection(connectionId: string, now = new Date()): Promise<void> {
  const [connection] = await db
    .update(schema.roomConnections)
    .set({ expiresAt: leaseExpiry(now), updatedAt: now })
    .where(eq(schema.roomConnections.id, connectionId))
    .returning({ id: schema.roomConnections.id })

  if (!connection) throw new Error('Realtime room connection lease expired')
}

export async function removeRoomConnection(connectionId: string): Promise<void> {
  await db.delete(schema.roomConnections).where(eq(schema.roomConnections.id, connectionId))
}

export async function listOnlineRoomUserIds(
  roomId: string,
  now = new Date(),
): Promise<readonly string[]> {
  await db
    .delete(schema.roomConnections)
    .where(
      and(
        eq(schema.roomConnections.roomId, roomId),
        lt(schema.roomConnections.expiresAt, now),
      ),
    )

  const rows = await db
    .selectDistinct({ userId: schema.roomConnections.userId })
    .from(schema.roomConnections)
    .where(
      and(
        eq(schema.roomConnections.roomId, roomId),
        gt(schema.roomConnections.expiresAt, now),
      ),
    )

  return rows.map((row) => row.userId)
}
