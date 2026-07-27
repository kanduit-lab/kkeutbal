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
    'errors.promotionLinkUrlInvalid',
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
  dismissHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 30),
  /** 0 이면 즉시 시작 / 무기한. */
  startsInHours: z
    .number()
    .int()
    .min(0)
    .max(24 * 365),
  endsInHours: z
    .number()
    .int()
    .min(0)
    .max(24 * 365),
})

export type CreatePromotionInput = z.infer<typeof createSchema>

/**
 * zod 이슈를 `errors.*` 키로 바꾼다. zod 기본 메시지는 영어라 그대로 내보내면
 * 사전을 우회한 영문 내부 문구가 사용자 화면에 뜬다 — 필드로 판단해 키를 고른다.
 */
function createIssueKey(issue: z.ZodIssue | undefined): string {
  if (issue?.message.startsWith('errors.')) return issue.message
  switch (issue?.path[0]) {
    case 'title':
      return 'errors.promotionTitleRequired'
    case 'linkUrl':
      return 'errors.promotionLinkUrlInvalid'
    case 'priority':
    case 'dismissHours':
    case 'startsInHours':
    case 'endsInHours':
      return 'errors.promotionRangeInvalid'
    default:
      return 'errors.invalidInput'
  }
}

export async function createPromotion(
  input: CreatePromotionInput,
): Promise<ActionResult<{ id: string }>> {
  const adminId = await requireAdmin()
  if (!adminId) return fail('errors.promotionAdminOnly')

  const parsed = createSchema.safeParse(input)
  if (!parsed.success) {
    return fail(createIssueKey(parsed.error.issues[0]))
  }
  const { kind, title, body, linkUrl, linkLabel, priority, dismissHours } = parsed.data
  const { startsInHours, endsInHours } = parsed.data

  if (endsInHours > 0 && startsInHours >= endsInHours) {
    return fail('errors.promotionScheduleInvalid')
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
    if (!created) return fail('errors.promotionCreateFailed')
    return ok({ id: created.id })
  } catch (error) {
    console.error('createPromotion failed:', error)
    return fail('errors.promotionCreateFailed')
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
  if (!adminId) return fail('errors.promotionAdminOnly')

  const parsed = setActiveSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')
  const { promotionId, isActive } = parsed.data

  try {
    const [updated] = await db
      .update(schema.promotions)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(schema.promotions.id, promotionId))
      .returning({ id: schema.promotions.id })
    if (!updated) return fail('errors.promotionNotFound')
    return ok({ promotionId, isActive })
  } catch (error) {
    console.error('setPromotionActive failed:', error)
    return fail('errors.promotionToggleFailed')
  }
}

const deleteSchema = z.object({ promotionId: z.string().uuid() })

export async function deletePromotion(
  input: z.infer<typeof deleteSchema>,
): Promise<ActionResult<{ promotionId: string }>> {
  const adminId = await requireAdmin()
  if (!adminId) return fail('errors.promotionAdminOnly')

  const parsed = deleteSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')

  try {
    const [removed] = await db
      .delete(schema.promotions)
      .where(eq(schema.promotions.id, parsed.data.promotionId))
      .returning({ id: schema.promotions.id })
    if (!removed) return fail('errors.promotionNotFound')
    return ok({ promotionId: removed.id })
  } catch (error) {
    console.error('deletePromotion failed:', error)
    return fail('errors.promotionDeleteFailed')
  }
}
