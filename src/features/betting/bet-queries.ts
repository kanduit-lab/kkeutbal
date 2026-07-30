import { and, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm'
import { schema } from '@/lib/db'
import type { Tx } from '../game/action-helpers'

const { rooms, roomMembers, rounds, roundParticipants, betActions, chipLedger } = schema

/**
 * `placeBet`/`approveBet`/`rejectBet`/`revertBet`가 트랜잭션 안에서 쓰는 조회 헬퍼 모음.
 * 여기 모인 함수들은 순수 판정이 아니라 단순 SELECT다 — 판정(턴 순서·레이즈 규칙·라운드 완료
 * 게이트)은 `bet-semantics.ts`/`bet-amount-rule.ts`, advisory lock·역할 검사는
 * `game/action-helpers.ts`가 맡는다.
 */

export async function memberInfo(
  tx: Tx,
  roomId: string,
  userId: string,
): Promise<{ role: string; leftAt: Date | null } | null> {
  const [member] = await tx
    .select({
      role: roomMembers.role,
      leftAt: roomMembers.leftAt,
    })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)))
    .limit(1)
  return member ?? null
}

/** 베팅 액션을 id로 조회 — 멱등성 확인(`placeBet`)과 각 액션의 대상 행 조회에 공통으로 쓴다. */
export async function findBetActionById(
  tx: Tx,
  actionId: string,
): Promise<typeof betActions.$inferSelect | undefined> {
  const [action] = await tx.select().from(betActions).where(eq(betActions.id, actionId)).limit(1)
  return action
}

export async function findRoomById(
  tx: Tx,
  roomId: string,
): Promise<typeof rooms.$inferSelect | undefined> {
  const [room] = await tx.select().from(rooms).where(eq(rooms.id, roomId)).limit(1)
  return room
}

/** 방에서 현재 진행 중인(`playing`) 라운드 — `placeBet`이 새 액션을 붙일 대상을 찾는다. */
export async function findActiveRoundForRoom(
  tx: Tx,
  roomId: string,
): Promise<typeof rounds.$inferSelect | undefined> {
  const [round] = await tx
    .select()
    .from(rounds)
    .where(and(eq(rounds.roomId, roomId), eq(rounds.status, 'playing')))
    .orderBy(desc(rounds.seq))
    .limit(1)
  return round
}

/** `rounds.id`, `rounds.seq`, `rounds.status`만 필요한 조회 — `approveBet`(승인 대상 라운드 확인)과
 * `revertBet`(되돌리기 대상 라운드가 아직 `playing`인지 확인)가 함께 쓴다. */
export async function findRoundById(
  tx: Tx,
  roundId: string,
): Promise<Pick<typeof rounds.$inferSelect, 'id' | 'seq' | 'status'> | undefined> {
  const [round] = await tx
    .select({ id: rounds.id, seq: rounds.seq, status: rounds.status })
    .from(rounds)
    .where(eq(rounds.id, roundId))
    .limit(1)
  return round
}

export async function findRoundParticipant(
  tx: Tx,
  roundId: string,
  userId: string,
): Promise<{ userId: string } | undefined> {
  const [participant] = await tx
    .select({ userId: roundParticipants.userId })
    .from(roundParticipants)
    .where(and(eq(roundParticipants.roundId, roundId), eq(roundParticipants.userId, userId)))
    .limit(1)
  return participant
}

export async function findPendingBetForUser(
  tx: Tx,
  roundId: string,
  userId: string,
): Promise<{ id: string } | undefined> {
  const [pending] = await tx
    .select({ id: betActions.id })
    .from(betActions)
    .where(
      and(
        eq(betActions.roundId, roundId),
        eq(betActions.userId, userId),
        eq(betActions.status, 'pending'),
      ),
    )
    .limit(1)
  return pending
}

/** `placeBet`이 (approval 모드 + 딜러 자동승인) 조합에서, 대기 중인 다른 승인 요청을 앞지르지
 * 않는지 확인한다. */
export async function hasPendingBetInRound(tx: Tx, roundId: string): Promise<boolean> {
  const [earlierPending] = await tx
    .select({ id: betActions.id })
    .from(betActions)
    .where(and(eq(betActions.roundId, roundId), eq(betActions.status, 'pending')))
    .limit(1)
  return Boolean(earlierPending)
}

/** `approveBet`이 승인 대기 큐를 seq 순서대로만 처리하게 강제한다. */
export async function hasEarlierPendingBet(
  tx: Tx,
  roundId: string,
  beforeSeq: number,
): Promise<boolean> {
  const [earlierPending] = await tx
    .select({ id: betActions.id })
    .from(betActions)
    .where(
      and(
        eq(betActions.roundId, roundId),
        eq(betActions.status, 'pending'),
        lt(betActions.seq, beforeSeq),
      ),
    )
    .limit(1)
  return Boolean(earlierPending)
}

export async function findNextBetSeq(tx: Tx, roundId: string): Promise<number> {
  const [seqRow] = await tx
    .select({ max: sql<number>`coalesce(max(${betActions.seq}), 0)` })
    .from(betActions)
    .where(eq(betActions.roundId, roundId))
  return (seqRow?.max ?? 0) + 1
}

/** `approveBet`의 승인 대상이 여전히 이번 라운드의 활성 참가자인지 확인 — 퇴장·관전자 전환 등으로
 * 승인 시점엔 더 이상 유효하지 않을 수 있다. */
export async function findActiveTargetParticipant(
  tx: Tx,
  roomId: string,
  roundId: string,
  userId: string,
): Promise<{ id: string } | undefined> {
  const [activeTarget] = await tx
    .select({ id: roomMembers.userId })
    .from(roomMembers)
    .innerJoin(
      roundParticipants,
      and(
        eq(roundParticipants.roundId, roundId),
        eq(roundParticipants.userId, roomMembers.userId),
      ),
    )
    .where(
      and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId), isNull(roomMembers.leftAt)),
    )
    .limit(1)
  return activeTarget
}

/** `revertBet`은 최신 액션부터 순서대로만 되돌릴 수 있다 — 이보다 뒤에 accepted된 액션이 있으면
 * 거부한다. */
export async function findLaterAcceptedBet(
  tx: Tx,
  roundId: string,
  afterSeq: number,
): Promise<{ id: string } | undefined> {
  const [laterAccepted] = await tx
    .select({ id: betActions.id })
    .from(betActions)
    .where(
      and(
        eq(betActions.roundId, roundId),
        eq(betActions.status, 'accepted'),
        gt(betActions.seq, afterSeq),
      ),
    )
    .limit(1)
  return laterAccepted
}

/** `revertBet`이 되돌린 액션에 딸려 있던 칩 원장 기록을 찾아 반대 보정(`correction`)을 남긴다. */
export async function findBetLedgerRow(
  tx: Tx,
  actionId: string,
): Promise<typeof chipLedger.$inferSelect | undefined> {
  const [ledgerRow] = await tx
    .select()
    .from(chipLedger)
    .where(and(eq(chipLedger.refActionId, actionId), eq(chipLedger.reason, 'bet')))
    .limit(1)
  return ledgerRow
}
