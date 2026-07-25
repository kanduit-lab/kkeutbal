'use server'

import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { db, schema } from '@/lib/db'
import { serverEnv } from '@/lib/env'
import { isAdminUser } from '@/features/auth/roles'
import { currentUserId } from '@/features/auth/session'
import { SETTINGS_ID, VISION_PROVIDERS } from './settings'

const saveVisionSettingsSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(VISION_PROVIDERS),
  model: z.string().trim().min(1).max(120),
})

export type SaveVisionSettingsInput = z.infer<typeof saveVisionSettingsSchema>

/** 공급자·모델·활성 상태만 관리자 DB 설정에 저장한다. API 키는 환경변수에만 존재한다. */
export async function saveVisionSettings(
  input: SaveVisionSettingsInput,
): Promise<ActionResult<undefined>> {
  const userId = await currentUserId()
  if (!userId || !(await isAdminUser(userId))) return fail('errors.adminOnlyChange')

  const parsed = saveVisionSettingsSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')
  if (parsed.data.enabled) {
    const env = serverEnv()
    const hasProviderKey =
      parsed.data.provider === 'anthropic'
        ? Boolean(env.ANTHROPIC_API_KEY)
        : Boolean(env.GEMINI_API_KEY)
    if (!hasProviderKey) return fail('errors.visionProviderKeyMissing')
  }

  try {
    const values = { ...parsed.data, updatedAt: new Date() }
    await db
      .insert(schema.visionSettings)
      .values({ id: SETTINGS_ID, ...values })
      .onConflictDoUpdate({ target: schema.visionSettings.id, set: values })
    return ok(undefined)
  } catch (error) {
    console.error('saveVisionSettings failed:', error)
    return fail('errors.saveVisionSettingsFailed')
  }
}
