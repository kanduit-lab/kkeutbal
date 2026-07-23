'use server'

import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { db, schema } from '@/lib/db'
import { currentUserId } from '@/features/auth/session'
import { isAdminUser } from '@/features/auth/roles'

/** 프로모션(배너·팝업) 관리 액션 — 관리자 전용. */

async function requireAdmin(): Promise<string | null> {
  const userId = await currentUserId()
  if (!userId) return null
  return (await isAdminUser(userId)) ? userId : null
}

/**
 * 링크는 그대로 `href` 로 나가므로 스킴을 좁힌다 — `javascript:` 같은 스킴이 들어오면
 * 관리자 입력이 곧 스크립트 실행이 된다. http(s) 절대주소이거나 앱 내부 경로만 허용한다.
 */
const linkUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) => /^https?:\/\//i.test(value) || (value.startsWith('/') && !value.startsWith('//')),
    'http(s) 주소이거나 / 로 시작하는 앱 내부 경로여야 합니다',
  )

/** 빈 문자열은 미입력으로 본다 — 폼이 빈 칸을 보내도 null 로 저장한다. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()

const createSchema = z.object({
  kind: z.enum(['banner', 'popup']),
  title: z.string().trim().min(1).max(80),
  body: optionalText(300),
  linkUrl: linkUrlSchema.nullable().or(z.literal('').transform(() => null)),
  linkLabel: optionalText(30),
  priority: z.number().int().min(0).max(1000),
  dismissHours: z.number().int().min(1).max(24 * 30),
  /** 0 이면 즉시 시작 / 무기한. */
  startsInHours: z.number().int().min(0).max(24 * 365),
  endsInHours: z.number().int().min(0).max(24 * 365),
})

export type CreatePromotionInput = z.infer<typeof createSchema>

export async function createPromotion(
  input: CreatePromotionInput,
): Promise<ActionResult<{ id: string }>> {
  const adminId = await requireAdmin()
  if (!adminId) return fail('관리자만 등록할 수 있습니다')

  const parsed = createSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다')
  }
  const { kind, title, body, linkUrl, linkLabel, priority, dismissHours } = parsed.data
  const { startsInHours, endsInHours } = parsed.data

  if (endsInHours > 0 && startsInHours >= endsInHours) {
    return fail('종료 시각은 시작 시각보다 뒤여야 합니다')
  }

  const now = Date.now()
  const startsAt = startsInHours > 0 ? new Date(now + startsInHours * 60 * 60 * 1000) : null
  const endsAt = endsInHours > 0 ? new Date(now + endsInHours * 60 * 60 * 1000) : null

  try {
    const [created] = await db
      .insert(schema.promotions)
      .values({
        kind,
        title,
        body,
        linkUrl,
        linkLabel,
        priority,
        dismissHours,
        startsAt,
        endsAt,
        createdBy: adminId,
      })
      .returning({ id: schema.promotions.id })
    if (!created) return fail('등록에 실패했습니다')
    return ok({ id: created.id })
  } catch (error) {
    console.error('createPromotion failed:', error)
    return fail('등록에 실패했습니다')
  }
}

const setActiveSchema = z.object({
  promotionId: z.string().uuid(),
  isActive: z.boolean(),
})

export async function setPromotionActive(
  input: z.infer<typeof setActiveSchema>,
): Promise<ActionResult<{ promotionId: string; isActive: boolean }>> {
  const adminId = await requireAdmin()
  if (!adminId) return fail('관리자만 변경할 수 있습니다')

  const parsed = setActiveSchema.safeParse(input)
  if (!parsed.success) return fail('입력값이 올바르지 않습니다')
  const { promotionId, isActive } = parsed.data

  try {
    const [updated] = await db
      .update(schema.promotions)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(schema.promotions.id, promotionId))
      .returning({ id: schema.promotions.id })
    if (!updated) return fail('프로모션을 찾을 수 없습니다')
    return ok({ promotionId, isActive })
  } catch (error) {
    console.error('setPromotionActive failed:', error)
    return fail('상태 변경에 실패했습니다')
  }
}

const deleteSchema = z.object({ promotionId: z.string().uuid() })

export async function deletePromotion(
  input: z.infer<typeof deleteSchema>,
): Promise<ActionResult<{ promotionId: string }>> {
  const adminId = await requireAdmin()
  if (!adminId) return fail('관리자만 삭제할 수 있습니다')

  const parsed = deleteSchema.safeParse(input)
  if (!parsed.success) return fail('입력값이 올바르지 않습니다')

  try {
    const [removed] = await db
      .delete(schema.promotions)
      .where(eq(schema.promotions.id, parsed.data.promotionId))
      .returning({ id: schema.promotions.id })
    if (!removed) return fail('프로모션을 찾을 수 없습니다')
    return ok({ promotionId: removed.id })
  } catch (error) {
    console.error('deletePromotion failed:', error)
    return fail('삭제에 실패했습니다')
  }
}
