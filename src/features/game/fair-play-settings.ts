import { z } from 'zod'
import type { RoomGameType } from './types'

/**
 * Stored under `rooms.rule_preset.fair_play`.
 *
 * Keep this boundary independent from Server Actions: a persisted jsonb value is
 * untrusted input, while a host-submitted setting must be complete and explicit.
 */
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

/** Verified dealing has not been made authoritative for GoStop yet. */
export function supportsVerifiedDealing(gameType: RoomGameType): boolean {
  return gameType === 'seotda' || gameType === 'poker'
}

/**
 * Validates settings supplied by a trusted caller boundary (for example a host
 * settings form). Unlike the reader below, malformed or partial input is not
 * silently repaired.
 */
export function parseFairPlaySettings(
  gameType: RoomGameType,
  input: unknown,
): FairPlaySettings {
  const settings = fairPlaySettingsSchema.parse(input)

  if (settings.dealing === 'verified' && !supportsVerifiedDealing(gameType)) {
    throw new Error(`Verified dealing is not supported for ${gameType}`)
  }

  return settings
}

/**
 * Reads a legacy or externally-written rule preset safely. Any absent,
 * malformed, or game-incompatible fair-play setting becomes the conservative
 * manual/pause default instead of changing a running room's behaviour.
 */
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
