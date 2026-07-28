import { z } from 'zod'

export const fundingModeSchema = z.enum(['session', 'account_credit'])

export type FundingMode = z.infer<typeof fundingModeSchema>

export const defaultFundingMode: FundingMode = 'session'

export function parseFundingMode(input: unknown): FundingMode {
  return fundingModeSchema.parse(input)
}

export function readFundingMode(rulePreset: unknown): FundingMode {
  if (!isRecord(rulePreset)) return defaultFundingMode

  const parsed = fundingModeSchema.safeParse(rulePreset.fundingMode)
  return parsed.success ? parsed.data : defaultFundingMode
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}