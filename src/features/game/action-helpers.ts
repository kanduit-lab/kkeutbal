import { and, eq, isNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { toSafeChipInteger } from './chip-integers'

const { roomMembers, chipLedger, buyIns } = schema

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function lockRoom(tx: Tx, roomId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${roomId}, 42))`)
}

export async function requireRole(
  tx: Tx,
  roomId: string,
  userId: string,
  roles: readonly string[],
): Promise<boolean> {
  const [member] = await tx
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
  return member ? roles.includes(member.role) : false
}

export function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505')
}

export async function balanceInRoom(tx: Tx, roomId: string, userId: string): Promise<number> {
  const [row] = await tx
    .select({ balance: sql<string>`coalesce(sum(${chipLedger.delta}), 0)::text` })
    .from(chipLedger)
    .where(and(eq(chipLedger.roomId, roomId), eq(chipLedger.userId, userId)))
  return toSafeChipInteger(row?.balance ?? '0', 'Room chip balance')
}

export async function netTotalInRoom(tx: Tx, roomId: string): Promise<number> {
  const [row] = await tx
    .select({
      total: sql<string>`(
        coalesce((select sum(${chipLedger.delta}) from ${chipLedger} where ${chipLedger.roomId} = ${roomId}), 0)
        - coalesce((select sum(${buyIns.amount}) from ${buyIns} where ${buyIns.roomId} = ${roomId}), 0)
      )::text`,
    })
    .from(schema.rooms)
    .where(eq(schema.rooms.id, roomId))
    .limit(1)
  return toSafeChipInteger(row?.total ?? '0', 'Room net total')
}

export function readPointValue(rulePreset: unknown): number {
  const value = readRuleNumber(rulePreset, 'pointValue')
  return value ?? 10
}

export function readBaseBet(rulePreset: unknown): number | null {
  return readRuleNumber(rulePreset, 'baseBet')
}

export function readMaxMembers(rulePreset: unknown): number {
  const value = readRuleNumber(rulePreset, 'maxMembers')
  return value !== null && value >= 2 && value <= 10 ? value : 10
}

export function readJoinAsObserver(rulePreset: unknown): boolean {
  if (rulePreset && typeof rulePreset === 'object' && 'joinAsObserver' in rulePreset) {
    const value = (rulePreset as Record<string, unknown>).joinAsObserver
    if (typeof value === 'boolean') return value
  }
  return false
}

function readRuleNumber(rulePreset: unknown, key: string): number | null {
  if (rulePreset && typeof rulePreset === 'object' && key in rulePreset) {
    const value = (rulePreset as Record<string, unknown>)[key]
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 1) return value
  }
  return null
}

export function defaultBaseBet(startingChips: number): number {
  return toSafeChipInteger(Math.max(1, Math.round(startingChips / 100)), 'Default base bet')
}