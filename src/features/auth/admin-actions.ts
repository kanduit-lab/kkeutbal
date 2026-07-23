'use server'

import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { db, schema } from '@/lib/db'
import { currentUserId } from './session'
import { isAdminUser } from './roles'

/** 관리자 전용 액션 — 게스트 토큰 발급·회수, 관리자 지정. */

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
  expiresInHours: z.number().int().min(0).max(24 * 90),
})

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

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateTokenCode()
    try {
      await db.insert(schema.guestTokens).values({ code, label, createdBy: adminId, expiresAt })
      return ok({ code })
    } catch (error) {
      const isUnique =
        Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505')
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
    const [updated] = await db
      .update(schema.users)
      .set({ isAdmin })
      .where(eq(schema.users.id, targetUserId))
      .returning({ id: schema.users.id })
    if (!updated) return fail('사용자를 찾을 수 없습니다')
    return ok({ targetUserId, isAdmin })
  } catch (error) {
    console.error('setAdmin failed:', error)
    return fail('권한 변경에 실패했습니다')
  }
}
