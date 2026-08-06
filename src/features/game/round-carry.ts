import { z } from 'zod'
import { addSafeChipIntegers } from './chip-integers'

/**
 * 재경기로 무효화된 판의 판돈 이월. 정책과 "왜 환불 후 재징수인가"는
 * `docs/04-game-engines.md`의 "재경기의 판돈 — 이월"이 정본이다.
 *
 * 여기 있는 것은 전부 순수 함수다 — DB 접근은 `round-actions.ts`가 한다.
 */

/** 무효화 시점에 그 판의 `rounds.result.carry`로 남기는 모양. */
export interface RoundCarry {
  readonly total: number
  readonly byUser: Readonly<Record<string, number>>
}

const carrySchema = z.object({
  total: z.number().int().positive(),
  byUser: z.record(z.string().uuid(), z.number().int().positive()),
})

const carryResultSchema = z.object({
  carry: carrySchema.optional(),
  carryConsumedBy: z.string().uuid().nullish(),
})

/**
 * `rounds.result` jsonb에서 아직 소비되지 않은 이월 몫을 읽는다.
 * jsonb는 스키마가 강제되지 않는 외부 입력이므로 zod로 검증한다 — 모양이 어긋나면
 * 이월이 없는 것으로 본다(조용히 틀린 금액을 걷는 것보다 낫다).
 */
export function readPendingCarry(result: unknown): RoundCarry | null {
  if (!result || typeof result !== 'object') return null
  const parsed = carryResultSchema.safeParse(result)
  if (!parsed.success) return null
  if (!parsed.data.carry) return null
  if (parsed.data.carryConsumedBy) return null
  return parsed.data.carry
}

/** 무효화되는 판의 원장 행에서 사람별 팟 기여액을 뽑는다. `bet` 행만 세고, 이미 되돌려진 행은 뺀다. */
export function carrySharesFromLedger(
  rows: readonly { id: string; userId: string; delta: number; reason: string }[],
  correctedIds: ReadonlySet<string | null>,
): RoundCarry | null {
  const byUser: Record<string, number> = {}
  let total = 0
  for (const row of rows) {
    if (row.reason !== 'bet') continue
    if (correctedIds.has(row.id)) continue
    // `bet` 행의 delta는 음수(칩이 나감)다. 기여액은 그 절댓값.
    const amount = -row.delta
    if (amount <= 0) continue
    byUser[row.userId] = addSafeChipIntegers(byUser[row.userId] ?? 0, amount, 'Carry share')
    total = addSafeChipIntegers(total, amount, 'Carry total')
  }
  return total > 0 ? { total, byUser } : null
}

/**
 * 이월 몫 중 새 판에서 실제로 다시 걷을 금액. 대상은 **새 판 참가자이면서 이월 몫이 있는
 * 사람**뿐이다 — 그 사이 나갔거나 관전으로 바뀐 사람 몫은 환불된 채로 남는다. 잔액을 넘겨
 * 걷지도 않는다(방장이 시작 칩을 조정했을 수 있다).
 */
export function collectableCarry({
  carries,
  participantIds,
  balanceByUser,
}: {
  carries: readonly RoundCarry[]
  participantIds: readonly string[]
  balanceByUser: ReadonlyMap<string, number>
}): readonly { userId: string; amount: number }[] {
  const seats = new Set(participantIds)
  const wanted = new Map<string, number>()
  for (const carry of carries) {
    for (const [userId, amount] of Object.entries(carry.byUser)) {
      if (!seats.has(userId)) continue
      wanted.set(userId, addSafeChipIntegers(wanted.get(userId) ?? 0, amount, 'Carry collect'))
    }
  }

  const collected: { userId: string; amount: number }[] = []
  for (const [userId, amount] of wanted) {
    const affordable = Math.min(amount, balanceByUser.get(userId) ?? 0)
    if (affordable > 0) collected.push({ userId, amount: affordable })
  }
  return collected
}
