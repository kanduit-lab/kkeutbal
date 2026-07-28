import { z } from 'zod'
import type { RoomGameType } from './types'

export const fairPlaySettingsSchema = z
  .object({
    dealing: z.enum(['manual', 'verified']),
    seedCollectionSeconds: z.number().int().min(10).max(120),
    turnTimeoutSeconds: z.number().int().min(15).max(180),
    timeoutPolicy: z.literal('pause'),
  })
  .strict()

export type FairPlaySettings = z.infer<typeof fairPlaySettingsSchema>

export const defaultFairPlaySettings: Readonly<FairPlaySettings> = {
  dealing: 'manual',
  seedCollectionSeconds: 30,
  turnTimeoutSeconds: 60,
  timeoutPolicy: 'pause',
}

export function supportsVerifiedDealing(gameType: RoomGameType): boolean {
  return gameType === 'seotda'
}

export function parseFairPlaySettings(gameType: RoomGameType, input: unknown): FairPlaySettings {
  const settings = fairPlaySettingsSchema.parse(input)

  if (settings.dealing === 'verified' && !supportsVerifiedDealing(gameType)) {
    throw new Error(`Verified dealing is not supported for ${gameType}`)
  }

  return settings
}

export function readFairPlaySettings(
  gameType: RoomGameType,
  rulePreset: unknown,
): FairPlaySettings {
  if (!isRecord(rulePreset)) return { ...defaultFairPlaySettings }

  const parsed = fairPlaySettingsSchema.safeParse(rulePreset.fair_play)
  if (!parsed.success) return { ...defaultFairPlaySettings }

  if (parsed.data.dealing === 'verified' && !supportsVerifiedDealing(gameType)) {
    return { ...defaultFairPlaySettings }
  }

  return parsed.data
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}