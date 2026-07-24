'use server'

import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { db, schema } from '@/lib/db'
import { serverEnv } from '@/lib/env'
import { lockRoom, netTotalInRoom } from '../game/action-helpers'
import { readFundingMode } from '../game/funding-mode'
import { currentUserId } from './session'
import { isAdminUser } from './roles'
import { generateRegistrationCode, registrationCodeHash } from './registration-codes'
import { guestTokenHash } from './guest-tokens'
import { encryptSsoClientSecret, SETTINGS_ID } from './sso-settings'

/** 관리자 전용 액션 — 게스트 토큰 발급·회수, 관리자 지정, 방 강제 정산. */

async function requireAdmin(): Promise<string | null> {
  const userId = await currentUserId()
  if (!userId) return null
  return (await isAdminUser(userId)) ? userId : null
}

/** 방 코드와 같은 문자 집합(혼동 문자 제외) 8자. */
const TOKEN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function generateTokenCode(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join('')
}

const createTokenSchema = z.object({
  label: z.string().trim().min(1).max(40),
  /** 만료까지의 시간. 0 이면 무기한. */
  expiresInHours: z
    .number()
    .int()
    .min(0)
    .max(24 * 90),
})

const createRegistrationCodeSchema = createTokenSchema

const saveSsoSettingsSchema = z.object({
  enabled: z.boolean(),
  issuer: z.string().trim().max(500),
  clientId: z.string().trim().max(500),
  clientSecret: z.string().trim().max(1000),
})

export async function saveSsoSettings(
  input: z.infer<typeof saveSsoSettingsSchema>,
): Promise<ActionResult<undefined>> {
  const adminId = await requireAdmin()
  if (!adminId) return fail('관리자만 변경할 수 있습니다')
  const parsed = saveSsoSettingsSchema.safeParse(input)
  if (!parsed.success) return fail('입력값이 올바르지 않습니다')

  const { enabled, issuer, clientId, clientSecret } = parsed.data
  if (enabled) {
    if (!issuer || !z.string().url().safeParse(issuer).success || !clientId) {
      return fail('SSO를 켜려면 Issuer URL과 Client ID를 입력하세요')
    }
  }

  try {
    const [current] = await db
      .select({ clientSecretCiphertext: schema.authSettings.ssoClientSecretCiphertext })
      .from(schema.authSettings)
      .where(eq(schema.authSettings.id, SETTINGS_ID))
      .limit(1)
    const clientSecretCiphertext = clientSecret
      ? encryptSsoClientSecret(clientSecret)
      : (current?.clientSecretCiphertext ?? null)

    if (enabled && !clientSecretCiphertext) {
      return fail('SSO를 켜려면 Client secret을 입력하세요')
    }

    await db
      .insert(schema.authSettings)
      .values({
        id: SETTINGS_ID,
        ssoEnabled: enabled,
        ssoIssuer: issuer || null,
        ssoClientId: clientId || null,
        ssoClientSecretCiphertext: clientSecretCiphertext,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.authSettings.id,
        set: {
          ssoEnabled: enabled,
          ssoIssuer: issuer || null,
          ssoClientId: clientId || null,
          ssoClientSecretCiphertext: clientSecretCiphertext,
          updatedAt: new Date(),
        },
      })
    return ok(undefined)
  } catch (error) {
    console.error('saveSsoSettings failed:', error)
    return fail('SSO 설정을 저장하지 못했습니다')
  }
}

export async function createRegistrationCode(
  input: z.infer<typeof createRegistrationCodeSchema>,
): Promise<ActionResult<{ code: string }>> {
  const adminId = await requireAdmin()
  if (!adminId) return fail('관리자만 발급할 수 있습니다')

  const parsed = createRegistrationCodeSchema.safeParse(input)
  if (!parsed.success) return fail('입력값이 올바르지 않습니다')
  const { label, expiresInHours } = parsed.data
  const expiresAt =
    expiresInHours > 0 ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000) : null
  const secret = serverEnv().AUTH_SECRET

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateRegistrationCode()
    try {
      await db.insert(schema.registrationCodes).values({
        codeHash: registrationCodeHash(code, secret),
        label,
        createdBy: adminId,
        expiresAt,
      })
      return ok({ code })
    } catch (error) {
      const isUnique = Boolean(
        error && typeof error === 'object' && 'code' in error && error.code === '23505',
      )
      if (isUnique) continue
      console.error('createRegistrationCode failed:', error)
      return fail('가입코드 발급에 실패했습니다')
    }
  }
  return fail('가입코드 생성에 실패했습니다. 다시 시도하세요')
}

export async function createGuestToken(
  input: z.infer<typeof createTokenSchema>,
): Promise<ActionResult<{ code: string }>> {
  const adminId = await requireAdmin()
  if (!adminId) return fail('관리자만 발급할 수 있습니다')

  const parsed = createTokenSchema.safeParse(input)
  if (!parsed.success) return fail('입력값이 올바르지 않습니다')
  const { label, expiresInHours } = parsed.data

  const expiresAt =
    expiresInHours > 0 ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000) : null
  const secret = serverEnv().AUTH_SECRET

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateTokenCode()
    try {
      await db
        .insert(schema.guestTokens)
        .values({ codeHash: guestTokenHash(code, secret), label, createdBy: adminId, expiresAt })
      return ok({ code })
    } catch (error) {
      const isUnique = Boolean(
        error && typeof error === 'object' && 'code' in error && error.code === '23505',
      )
      if (isUnique) continue
      console.error('createGuestToken failed:', error)
      return fail('토큰 발급에 실패했습니다')
    }
  }
  return fail('토큰 코드 생성에 실패했습니다. 다시 시도하세요')
}

const revokeSchema = z.object({ tokenId: z.string().uuid() })

export async function revokeGuestToken(
  input: z.infer<typeof revokeSchema>,
): Promise<ActionResult<{ tokenId: string }>> {
  const adminId = await requireAdmin()
  if (!adminId) return fail('관리자만 회수할 수 있습니다')

  const parsed = revokeSchema.safeParse(input)
  if (!parsed.success) return fail('입력값이 올바르지 않습니다')

  try {
    const [updated] = await db
      .update(schema.guestTokens)
      .set({ revokedAt: new Date() })
      .where(eq(schema.guestTokens.id, parsed.data.tokenId))
      .returning({ id: schema.guestTokens.id })
    if (!updated) return fail('토큰을 찾을 수 없습니다')
    return ok({ tokenId: updated.id })
  } catch (error) {
    console.error('revokeGuestToken failed:', error)
    return fail('토큰 회수에 실패했습니다')
  }
}

const revokeRegistrationCodeSchema = z.object({ codeId: z.string().uuid() })

export async function revokeRegistrationCode(
  input: z.infer<typeof revokeRegistrationCodeSchema>,
): Promise<ActionResult<{ codeId: string }>> {
  const adminId = await requireAdmin()
  if (!adminId) return fail('관리자만 회수할 수 있습니다')
  const parsed = revokeRegistrationCodeSchema.safeParse(input)
  if (!parsed.success) return fail('입력값이 올바르지 않습니다')

  try {
    const [updated] = await db
      .update(schema.registrationCodes)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(schema.registrationCodes.id, parsed.data.codeId),
          isNull(schema.registrationCodes.revokedAt),
        ),
      )
      .returning({ id: schema.registrationCodes.id })
    if (!updated) return fail('가입코드를 찾을 수 없거나 이미 회수했습니다')
    return ok({ codeId: updated.id })
  } catch (error) {
    console.error('revokeRegistrationCode failed:', error)
    return fail('가입코드 회수에 실패했습니다')
  }
}

const setAdminSchema = z.object({
  targetUserId: z.string().uuid(),
  isAdmin: z.boolean(),
})

export async function setAdmin(
  input: z.infer<typeof setAdminSchema>,
): Promise<ActionResult<{ targetUserId: string; isAdmin: boolean }>> {
  const adminId = await requireAdmin()
  if (!adminId) return fail('관리자만 변경할 수 있습니다')

  const parsed = setAdminSchema.safeParse(input)
  if (!parsed.success) return fail('입력값이 올바르지 않습니다')
  const { targetUserId, isAdmin } = parsed.data

  if (targetUserId === adminId && !isAdmin) {
    return fail('자기 자신의 관리자 권한은 해제할 수 없습니다')
  }

  try {
    const [target] = await db
      .select({ id: schema.users.id, authentikSub: schema.users.authentikSub })
      .from(schema.users)
      .where(eq(schema.users.id, targetUserId))
      .limit(1)
    if (!target) return fail('사용자를 찾을 수 없습니다')
    if (target.authentikSub.startsWith('guest:')) {
      return fail('게스트 계정은 관리자로 지정할 수 없습니다')
    }

    const [updated] = await db
      .update(schema.users)
      .set({ isAdmin })
      .where(eq(schema.users.id, targetUserId))
      .returning({ id: schema.users.id })
    if (!updated) return fail('권한을 변경하지 못했습니다')
    return ok({ targetUserId, isAdmin })
  } catch (error) {
    console.error('setAdmin failed:', error)
    return fail('권한 변경에 실패했습니다')
  }
}

/** 강제 정산으로 무효 처리되는 판·베팅에 남기는 사유. */
const ADMIN_CLOSE_REASON = '관리자 강제 정산'

/**
 * 방 강제 정산 — 방장이 잠수하거나 게스트 로그인을 잃어 방을 못 닫을 때의 회수 경로.
 * closeRoom(game/actions.ts)과 달리 방장 역할 대신 관리자 권한으로 통과하고,
 * 진행 중인 판이 있으면 voidRound(game/round-actions.ts)와 같은 절차로 무효 처리한 뒤 정산한다.
 */
export async function adminCloseRoom(roomId: string): Promise<ActionResult<{ code: string }>> {
  const adminId = await requireAdmin()
  if (!adminId) return fail('관리자만 강제 정산할 수 있습니다')
  if (!z.string().uuid().safeParse(roomId).success) return fail('잘못된 방입니다')

  try {
    return await db.transaction(async (tx) => {
      await lockRoom(tx, roomId)

      const [room] = await tx
        .select({
          code: schema.rooms.code,
          status: schema.rooms.status,
          rulePreset: schema.rooms.rulePreset,
        })
        .from(schema.rooms)
        .where(eq(schema.rooms.id, roomId))
        .limit(1)
      if (!room) return fail('방을 찾을 수 없습니다')
      if (room.status === 'settled' || room.status === 'closed') return fail('이미 끝난 방입니다')

      const [round] = await tx
        .select({ id: schema.rounds.id })
        .from(schema.rounds)
        .where(and(eq(schema.rounds.roomId, roomId), eq(schema.rounds.status, 'playing')))
        .orderBy(desc(schema.rounds.seq))
        .limit(1)

      if (round) {
        // voidRound 와 동일한 정정 절차 — 아직 정정되지 않은 베팅 행을 전액 반환한다.
        const betRows = await tx
          .select()
          .from(schema.chipLedger)
          .where(and(eq(schema.chipLedger.roundId, round.id), eq(schema.chipLedger.reason, 'bet')))
        const corrected = new Set(
          (
            await tx
              .select({ revertedOf: schema.chipLedger.revertedOf })
              .from(schema.chipLedger)
              .where(
                and(
                  eq(schema.chipLedger.roundId, round.id),
                  eq(schema.chipLedger.reason, 'correction'),
                ),
              )
          ).map((row) => row.revertedOf),
        )

        const refunds = betRows
          .filter((row) => !corrected.has(row.id))
          .map((row) => ({
            roomId,
            roundId: round.id,
            userId: row.userId,
            delta: -row.delta,
            reason: 'correction' as const,
            refActionId: row.refActionId,
            revertedOf: row.id,
          }))
        if (refunds.length > 0) await tx.insert(schema.chipLedger).values(refunds)

        await tx
          .update(schema.betActions)
          .set({ status: 'reverted', reason: ADMIN_CLOSE_REASON })
          .where(
            and(
              eq(schema.betActions.roundId, round.id),
              inArray(schema.betActions.status, ['pending', 'accepted']),
            ),
          )

        await tx
          .update(schema.rounds)
          .set({ status: 'voided', result: { note: ADMIN_CLOSE_REASON }, endedAt: new Date() })
          .where(eq(schema.rounds.id, round.id))
      }

      if ((await netTotalInRoom(tx, roomId)) !== 0) {
        return fail('세션 손익 합계가 0이 아니라 정산할 수 없습니다')
      }
      if (readFundingMode(room.rulePreset) === 'account_credit') {
        // DB RPC도 users.is_admin을 다시 확인한다. 방장이 사라진 복구 경로에서 전역 lock이
        // session 원장만 남긴 채 고립되는 것을 막기 위해 room 상태 변경과 같은 트랜잭션으로 정산한다.
        await tx.execute(sql`select public.settle_room_credits(${roomId}::uuid, ${adminId}::uuid)`)
      }

      await tx
        .update(schema.rooms)
        .set({ status: 'settled', closedAt: new Date() })
        .where(eq(schema.rooms.id, roomId))

      return ok({ code: room.code })
    })
  } catch (error) {
    console.error('adminCloseRoom failed:', error)
    return fail('강제 정산에 실패했습니다')
  }
}
