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
import type { AdminBulkFailure } from './admin-queries'
import { generateRegistrationCode, registrationCodeHash } from './registration-codes'
import { guestTokenHash } from './guest-tokens'
import { encryptSsoClientSecret, SETTINGS_ID } from './sso-settings'

async function requireAdmin(): Promise<string | null> {
  const userId = await currentUserId()
  if (!userId) return null
  return (await isAdminUser(userId)) ? userId : null
}

const TOKEN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function generateTokenCode(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join('')
}

const createTokenSchema = z.object({
  label: z.string().trim().min(1).max(40),
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
  if (!adminId) return fail('errors.adminOnlyChange')
  const parsed = saveSsoSettingsSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')

  const { enabled, issuer, clientId, clientSecret } = parsed.data
  if (enabled) {
    if (!issuer || !z.string().url().safeParse(issuer).success || !clientId) {
      return fail('errors.ssoIssuerAndClientIdRequired')
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
      return fail('errors.ssoClientSecretRequired')
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
    return fail('errors.saveSsoSettingsFailed')
  }
}

export async function createRegistrationCode(
  input: z.infer<typeof createRegistrationCodeSchema>,
): Promise<ActionResult<{ code: string }>> {
  const adminId = await requireAdmin()
  if (!adminId) return fail('errors.adminOnlyIssue')

  const parsed = createRegistrationCodeSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')
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
      return fail('errors.createRegistrationCodeFailed')
    }
  }
  return fail('errors.registrationCodeGenerationFailed')
}

export async function createGuestToken(
  input: z.infer<typeof createTokenSchema>,
): Promise<ActionResult<{ code: string }>> {
  const adminId = await requireAdmin()
  if (!adminId) return fail('errors.adminOnlyIssue')

  const parsed = createTokenSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')
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
      return fail('errors.createGuestTokenFailed')
    }
  }
  return fail('errors.guestTokenGenerationFailed')
}

const revokeSchema = z.object({ tokenId: z.string().uuid() })

export async function revokeGuestToken(
  input: z.infer<typeof revokeSchema>,
): Promise<ActionResult<{ tokenId: string }>> {
  const adminId = await requireAdmin()
  if (!adminId) return fail('errors.adminOnlyRevoke')

  const parsed = revokeSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')

  try {
    const [updated] = await db
      .update(schema.guestTokens)
      .set({ revokedAt: new Date() })
      .where(eq(schema.guestTokens.id, parsed.data.tokenId))
      .returning({ id: schema.guestTokens.id })
    if (!updated) return fail('errors.guestTokenNotFound')
    return ok({ tokenId: updated.id })
  } catch (error) {
    console.error('revokeGuestToken failed:', error)
    return fail('errors.revokeGuestTokenFailed')
  }
}

const revokeRegistrationCodeSchema = z.object({ codeId: z.string().uuid() })

export async function revokeRegistrationCode(
  input: z.infer<typeof revokeRegistrationCodeSchema>,
): Promise<ActionResult<{ codeId: string }>> {
  const adminId = await requireAdmin()
  if (!adminId) return fail('errors.adminOnlyRevoke')
  const parsed = revokeRegistrationCodeSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')

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
    if (!updated) return fail('errors.registrationCodeNotFoundOrRevoked')
    return ok({ codeId: updated.id })
  } catch (error) {
    console.error('revokeRegistrationCode failed:', error)
    return fail('errors.revokeRegistrationCodeFailed')
  }
}

// 관리자 권한 변경은 `member-actions.ts`의 `setAdminBulk`로 옮겼다. 단건과 일괄이 갈라져
// 있으면 계정 상태(`users.status`) 같은 새 규칙이 한쪽에만 적용되는 상태가 생긴다.

const ADMIN_CLOSE_REASON = '관리자 강제 정산'

export async function adminCloseRoom(roomId: string): Promise<ActionResult<{ code: string }>> {
  const adminId = await requireAdmin()
  if (!adminId) return fail('errors.adminOnlyCloseRoom')
  if (!z.string().uuid().safeParse(roomId).success) return fail('errors.invalidRoom')

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
      if (!room) return fail('errors.roomNotFound')
      if (room.status === 'settled' || room.status === 'closed') return fail('errors.roomEnded')

      const [round] = await tx
        .select({ id: schema.rounds.id })
        .from(schema.rounds)
        .where(and(eq(schema.rounds.roomId, roomId), eq(schema.rounds.status, 'playing')))
        .orderBy(desc(schema.rounds.seq))
        .limit(1)

      if (round) {
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
        return fail('errors.settlementNotBalanced')
      }
      if (readFundingMode(room.rulePreset) === 'account_credit') {
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
    return fail('errors.adminCloseRoomFailed')
  }
}
/**
 * 방을 한 번에 여러 개 강제 정산한다. 한 방씩 `adminCloseRoom`을 그대로 호출하므로
 * 방마다 트랜잭션과 advisory lock이 따로 잡힌다 — **하나가 실패해도 나머지는 정산된다**.
 * 크레딧 보존식이 깨진 방(`errors.roomCreditsStranded`)이 섞여 있어도 나머지가 막히지 않게
 * 하려는 것이 이 분리의 목적이다.
 *
 * 결과는 코드별로 돌려준다 — 무엇이 왜 실패했는지 모르면 관리자가 다음에 무엇을 할지
 * 정할 수 없다.
 */
const closeRoomsSchema = z.array(z.string().uuid()).min(1).max(100)

export async function adminCloseRooms(
  roomIds: readonly string[],
): Promise<ActionResult<{ closed: readonly string[]; failed: readonly AdminBulkFailure[] }>> {
  const adminId = await requireAdmin()
  if (!adminId) return fail('errors.adminOnlyCloseRoom')

  const parsed = closeRoomsSchema.safeParse(roomIds)
  if (!parsed.success) return fail('errors.invalidInput')

  // 같은 id가 두 번 들어오면 두 번째는 `roomEnded`로 실패해 결과가 시끄러워진다.
  const unique = [...new Set(parsed.data)]

  const closed: string[] = []
  const failed: AdminBulkFailure[] = []
  for (const roomId of unique) {
    const result = await adminCloseRoom(roomId)
    if (result.success) closed.push(result.data.code)
    else failed.push({ roomId, error: result.error })
  }

  return ok({ closed, failed })
}
