import 'server-only'

import { eq } from 'drizzle-orm'
import { serverEnv } from '@/lib/env'
import { getOptionalDatabase } from '@/lib/optional-database'

const SETTINGS_ID = 'default'

export const VISION_PROVIDERS = ['anthropic', 'gemini'] as const
export type VisionProvider = (typeof VISION_PROVIDERS)[number]

export interface VisionSettingsView {
  readonly enabled: boolean
  readonly provider: VisionProvider
  readonly model: string
  /** API 키의 원문은 반환하지 않는다. 환경변수 준비 여부만 관리자 UI에 전달한다. */
  readonly hasAnthropicApiKey: boolean
  readonly hasGeminiApiKey: boolean
}

/** Server Action에서만 쓰는 활성 공급자 설정. API 키는 환경변수에서만 읽는다. */
export interface ActiveVisionSettings {
  readonly provider: VisionProvider
  readonly model: string
  readonly apiKey: string
}

const VISION_DISABLED: Pick<VisionSettingsView, 'enabled' | 'provider' | 'model'> = Object.freeze({
  enabled: false,
  provider: 'anthropic',
  model: 'claude-sonnet-5',
})

function providerAvailability() {
  const env = serverEnv()
  return {
    hasAnthropicApiKey: Boolean(env.ANTHROPIC_API_KEY),
    hasGeminiApiKey: Boolean(env.GEMINI_API_KEY),
  }
}

/** 관리자·족보 화면에 필요한 설정과 공급자 준비 상태. API 키는 절대 반환하지 않는다. */
export async function getVisionSettings(): Promise<VisionSettingsView> {
  const availability = providerAvailability()
  try {
    const database = await getOptionalDatabase()
    if (!database) return { ...VISION_DISABLED, ...availability }
    const { db, schema } = database
    const [settings] = await db
      .select({
        enabled: schema.visionSettings.enabled,
        provider: schema.visionSettings.provider,
        model: schema.visionSettings.model,
      })
      .from(schema.visionSettings)
      .where(eq(schema.visionSettings.id, SETTINGS_ID))
      .limit(1)

    return {
      enabled: settings?.enabled ?? VISION_DISABLED.enabled,
      provider: settings?.provider ?? VISION_DISABLED.provider,
      model: settings?.model ?? VISION_DISABLED.model,
      ...availability,
    }
  } catch (error) {
    console.error('getVisionSettings failed:', error)
    return { ...VISION_DISABLED, ...availability }
  }
}

/** 사진 인식에 쓸 활성 설정. 선택된 공급자의 환경변수 키가 없으면 안전하게 비활성화한다. */
export async function getActiveVisionSettings(): Promise<ActiveVisionSettings | null> {
  const settings = await getVisionSettings()
  if (!settings.enabled) return null

  const env = serverEnv()
  const apiKey = settings.provider === 'anthropic' ? env.ANTHROPIC_API_KEY : env.GEMINI_API_KEY
  if (!apiKey) return null

  return { provider: settings.provider, model: settings.model, apiKey }
}

export { SETTINGS_ID }
