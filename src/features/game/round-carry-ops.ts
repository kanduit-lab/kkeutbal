import { and, eq, sql } from 'drizzle-orm'
import { schema } from '@/lib/db'
import { balanceInRoom, type Tx } from './action-helpers'
import { collectableCarry, readPendingCarry, type RoundCarry } from './round-carry'

const { rounds, chipLedger } = schema

/**
 * 재경기로 무효화된 판들 중 아직 소비되지 않은 이월 몫. 정책은
 * `docs/04-game-engines.md`의 "재경기의 판돈 — 이월"이 정본이다.
 */
async function pendingCarryRounds(
  tx: Tx,
  roomId: string,
): Promise<readonly { roundId: string; carry: RoundCarry }[]> {
  const rows = await tx
    .select({ id: rounds.id, result: rounds.result })
    .from(rounds)
    .where(and(eq(rounds.roomId, roomId), eq(rounds.status, 'voided')))

  const pending: { roundId: string; carry: RoundCarry }[] = []
  for (const row of rows) {
    const carry = readPendingCarry(row.result)
    if (carry) pending.push({ roundId: row.id, carry })
  }
  return pending
}

/**
 * 방에 남아 있는 미소비 이월 판돈 총액. 로비가 "이월 판돈"으로 보여준다.
 * 실제로 걷힐 금액은 새 판 참가자 구성에 따라 이보다 작을 수 있다 —
 * 그 사이 나갔거나 관전으로 바뀐 사람 몫은 걷지 않는다.
 */
export async function pendingCarryTotal(tx: Tx, roomId: string): Promise<number> {
  const pending = await pendingCarryRounds(tx, roomId)
  return pending.reduce((sum, entry) => sum + entry.carry.total, 0)
}

/**
 * 이월 몫을 새 판의 팟으로 걷는다. `bet_actions`는 만들지 않는다 — 기여도는 `bet_actions`,
 * 팟은 원장에서 나오므로 이월 판돈은 팟에만 들어가고 콜 의무를 만들지 않는다.
 *
 * 걷은 뒤 원본 판의 `result.carryConsumedBy`를 찍어 두 번 걷히지 않게 한다. 호출자는 방
 * advisory lock(`lockRoom`)을 쥐고 있어야 한다.
 */
export async function collectCarriedPot(
  tx: Tx,
  roomId: string,
  newRoundId: string,
  participants: readonly { userId: string }[],
): Promise<number> {
  const pending = await pendingCarryRounds(tx, roomId)
  if (pending.length === 0) return 0

  const participantIds = participants.map((participant) => participant.userId)
  const balanceByUser = new Map<string, number>()
  for (const userId of participantIds) {
    balanceByUser.set(userId, await balanceInRoom(tx, roomId, userId))
  }

  const collected = collectableCarry({
    carries: pending.map((entry) => entry.carry),
    participantIds,
    balanceByUser,
  })

  if (collected.length > 0) {
    await tx.insert(chipLedger).values(
      collected.map((entry) => ({
        roomId,
        roundId: newRoundId,
        userId: entry.userId,
        delta: -entry.amount,
        reason: 'bet' as const,
      })),
    )
  }

  // 걷을 게 없었어도(전원 퇴장·관전 전환) 소비 표시는 남긴다. 안 그러면 그 이월액이
  // 영영 "다음 판에 걷힐 예정"으로 로비에 떠 있는다.
  for (const entry of pending) {
    await tx
      .update(rounds)
      .set({
        result: sql`coalesce(${rounds.result}, '{}'::jsonb) || ${JSON.stringify({ carryConsumedBy: newRoundId })}::jsonb`,
      })
      .where(eq(rounds.id, entry.roundId))
  }

  return collected.reduce((sum, entry) => sum + entry.amount, 0)
}
