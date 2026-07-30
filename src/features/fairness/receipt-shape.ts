import type { ClientSeedHash } from './protocol'
import {
  hashSchema,
  idSchema,
  type PublicFairnessDealPlan,
  type PublicFairnessReceipt,
} from './receipt-types'

export function parseRoundId(value: string): string {
  return idSchema.parse(value)
}

export function normalizeHash(value: string): string {
  const normalized = hashSchema.parse(value.toLowerCase())
  return normalized
}

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

export function numbersEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

export function canonicalizeClientSeedHashes(
  entries: readonly ClientSeedHash[],
): readonly ClientSeedHash[] {
  const normalized = entries.map((entry) => ({
    userId: parseRoundId(entry.userId),
    seedHash: normalizeHash(entry.seedHash),
  }))
  normalized.sort((left, right) =>
    left.userId < right.userId ? -1 : left.userId > right.userId ? 1 : 0,
  )
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index - 1]?.userId === normalized[index]?.userId) {
      throw new Error('Duplicate client seed contributor')
    }
  }
  return Object.freeze(normalized.map((entry) => Object.freeze(entry)))
}

export function freezeDealPlan(plan: PublicFairnessDealPlan): PublicFairnessDealPlan {
  return Object.freeze({
    ...plan,
    publicBoardStages: Object.freeze([...plan.publicBoardStages]),
  })
}

export function freezeReceipt(receipt: PublicFairnessReceipt): PublicFairnessReceipt {
  return Object.freeze({
    ...receipt,
    seedAudit: Object.freeze({
      ...receipt.seedAudit,
      clientSeedHashes: Object.freeze(
        receipt.seedAudit.clientSeedHashes.map((entry) => Object.freeze({ ...entry })),
      ),
    }),
    dealPlan: freezeDealPlan(receipt.dealPlan),
  })
}
