import { and, eq, isNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { toSafeChipInteger } from './chip-integers'

/** game 도메인 Server Action 공통 헬퍼. 'use server' 파일이 아니므로 직접 노출되지 않는다. */

const { roomMembers, chipLedger, buyIns } = schema

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** 방 단위 직렬화. 칩 이동·판 전환의 경쟁 조건을 트랜잭션 advisory lock 으로 막는다. */
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

/** 세션 손익 합계. 정상 원장은 전체 잔액 합과 전체 바이인 합이 같으므로 항상 0이다. */
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

/** rulePreset jsonb 에서 고스톱 점당 칩. 없으면 10. */
export function readPointValue(rulePreset: unknown): number {
  const value = readRuleNumber(rulePreset, 'pointValue')
  return value ?? 10
}

/** rulePreset jsonb 에서 베팅 기본 단위(삥). 없으면 null — 호출부가 시작 칩 기준으로 계산한다. */
export function readBaseBet(rulePreset: unknown): number | null {
  return readRuleNumber(rulePreset, 'baseBet')
}

/** rulePreset jsonb 에서 방 정원. 2~10 범위 밖이거나 없으면 10. */
export function readMaxMembers(rulePreset: unknown): number {
  const value = readRuleNumber(rulePreset, 'maxMembers')
  return value !== null && value >= 2 && value <= 10 ? value : 10
}

/** rulePreset jsonb 에서 신규 입장자를 관전자로 받을지 여부. 없으면 false. */
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

/** 시작 칩 기준 기본 삥 — rulePreset 미지정 시의 파생 규칙. */
export function defaultBaseBet(startingChips: number): number {
  return toSafeChipInteger(Math.max(1, Math.round(startingChips / 100)), 'Default base bet')
}
