// Public fairness receipt module surface.
//
// Split by responsibility across sibling files — see docs/10-virtual-credit-and-fair-play.md
// ("공정 셔플 프로토콜") for the protocol this receipt exposes:
//   receipt-types.ts          shared types, zod schemas, static game deal rules
//   receipt-shape.ts          canonicalization/freezing helpers shared by the modules below
//   receipt-deal-plan.ts      deal-plan commitment assembly (createPublicFairnessDealPlan)
//   receipt-validation.ts     schema + structural validation (parse/validate)
//   receipt-create.ts         public receipt assembly (createPublicFairnessReceipt)
//   receipt-audit.ts          full-reveal deck recomputation (verifyPublicFairnessAudit)
//   receipt-serialization.ts  canonical JSON round-trip (serialize/deserialize)
//
// This file only re-exports — the export names and this module path
// (`@/features/fairness/receipt`) are the stable public surface consumers rely on.

export {
  FAIRNESS_PUBLIC_RECEIPT_VERSION,
  type CreatePublicFairnessReceiptInput,
  type FairnessAuditedGame,
  type PublicFairnessDealPlan,
  type PublicFairnessReceipt,
  type PublicFairnessSeedAuditPlan,
} from './receipt-types'

export { verifyPublicFairnessAudit } from './receipt-audit'
export { createPublicFairnessDealPlan } from './receipt-deal-plan'
export { createPublicFairnessReceipt } from './receipt-create'
export {
  deserializePublicFairnessReceipt,
  serializePublicFairnessReceipt,
} from './receipt-serialization'
export { parsePublicFairnessReceipt, validatePublicFairnessReceipt } from './receipt-validation'
