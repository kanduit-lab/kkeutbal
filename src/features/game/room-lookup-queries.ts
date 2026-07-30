import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import {
  defaultBaseBet,
  readBaseBet,
  readJoinAsObserver,
  readMaxMembers,
  readPointValue,
} from './action-helpers'
import { readFundingMode } from './funding-mode'
import { readFairPlaySettings } from './fair-play-settings'
import type { MemberView, RoomView } from './types'

const { rooms, roomMembers } = schema

export async function findRoomByCode(code: string): Promise<RoomView | null> {
  const [room] = await db.select().from(rooms).where(eq(rooms.code, code)).limit(1)
  if (!room) return null
  return toRoomView(room)
}

export function toRoomView(room: typeof rooms.$inferSelect): RoomView {
  return {
    id: room.id,
    code: room.code,
    name: room.name,
    gameType: room.gameType,
    status: room.status,
    inputMode: room.inputMode,
    startingChips: room.startingChips,
    hostId: room.hostId,
    pointValue: readPointValue(room.rulePreset),
    baseBet: readBaseBet(room.rulePreset) ?? defaultBaseBet(room.startingChips),
    maxMembers: readMaxMembers(room.rulePreset),
    joinAsObserver: readJoinAsObserver(room.rulePreset),
    fundingMode: readFundingMode(room.rulePreset),
    fairPlay: readFairPlaySettings(room.gameType, room.rulePreset),
  }
}

export async function getMemberRole(
  roomId: string,
  userId: string,
): Promise<MemberView['role'] | null> {
  const [member] = await db
    .select({ role: roomMembers.role })
    .from(roomMembers)
    .where(
      and(
        eq(roomMembers.roomId, roomId),
        eq(roomMembers.userId, userId),
        isNull(roomMembers.leftAt),
      ),
    )
    .limit(1)
  return member?.role ?? null
}
