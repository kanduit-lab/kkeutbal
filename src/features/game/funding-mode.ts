import { z } from 'zod'

/**
 * The source of a room's chips. This remains a separate setting from the
 * account-credit implementation so legacy rooms never opt in accidentally.
 */
export const fundingModeSchema = z.enum(['session', 'account_credit'])

export type FundingMode = z.infer<typeof fundingModeSchema>

export const defaultFundingMode: FundingMode = 'session'

/**
 * Validates a direct caller input. Unknown values must be rejected at the
 * action/form boundary rather than silently changing a room's funding source.
 */
export function parseFundingMode(input: unknown): FundingMode {
  return fundingModeSchema.parse(input)
}

/**
 * Safely reads externally persisted rule json. Old or malformed rooms retain
 * the legacy session balance model.
 */
export function readFundingMode(rulePreset: unknown): FundingMode {
  if (!isRecord(rulePreset)) return defaultFundingMode

  const parsed = fundingModeSchema.safeParse(rulePreset.fundingMode)
  return parsed.success ? parsed.data : defaultFundingMode
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
