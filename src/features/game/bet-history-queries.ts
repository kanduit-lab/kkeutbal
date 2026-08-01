import { asc, desc, eq, inArray } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db, schema } from '@/lib/db'
import type { BetActionKind, BetStatus } from './types'

const { betActions, rounds, users } = schema

/**
 * 한 번에 돌려주는 판 수 상한. MT 한 번이면 수백 판이 쌓이는데 전부 실으면 응답도 메모리도
 * 같이 커진다. 잘라낸 사실은 `truncated`로 같이 넘겨서 화면이 조용히 감추지 못하게 한다.
 */
export const BET_HISTORY_ROUND_CAP = 100

export type BetHistoryRoundStatus = 'playing' | 'ended' | 'voided'

export interface BetHistoryActionView {
  readonly id: string
  readonly userId: string

  /** 이름은 질의에서 붙인다 — 이유는 `getRoomBetHistory` 주석 참고. 사용자 삭제 시 null */
  readonly userName: string | null
  readonly enteredBy: string | null
  readonly enteredByName: string | null
  readonly action: BetActionKind
  readonly amount: number
  readonly status: BetStatus
  readonly seq: number
  readonly createdAt: string
  readonly reason: string | null
}

export interface BetHistoryRoundView {
  readonly roundId: string
  readonly seq: number
  readonly pot: number
  readonly status: BetHistoryRoundStatus
  readonly winnerId: string | null
  readonly winnerName: string | null
  readonly actions: readonly BetHistoryActionView[]
}

export interface BetHistoryView {
  /** 최신 판이 먼저. 각 판의 액션은 `seq` 오름차순 */
  readonly rounds: readonly BetHistoryRoundView[]

  /** 상한에 걸려 잘렸는지. 화면이 "최근 N판만"이라고 알려야 한다 */
  readonly truncated: boolean
  readonly cap: number
}

interface ActionRow {
  readonly id: string
  readonly roundId: string
  readonly userId: string
  readonly userName: string | null
  readonly enteredBy: string | null
  readonly enteredByName: string | null
  readonly action: BetActionKind
  readonly amount: number
  readonly status: BetStatus
  readonly seq: number
  readonly createdAt: Date
  readonly reason: string | null
}

const NO_ACTIONS: readonly BetHistoryActionView[] = []

function toActionView(row: ActionRow): BetHistoryActionView {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    enteredBy: row.enteredBy,
    enteredByName: row.enteredByName,
    action: row.action,
    amount: row.amount,
    status: row.status,
    seq: row.seq,
    createdAt: row.createdAt.toISOString(),
    reason: row.reason,
  }
}

function groupByRound(rows: readonly ActionRow[]): Map<string, BetHistoryActionView[]> {
  const grouped = new Map<string, BetHistoryActionView[]>()
  for (const row of rows) {
    // 로컬 accumulator라 밖으로 새지 않는다. 판마다 배열을 새로 만들면 O(n²)가 된다.
    const bucket = grouped.get(row.roundId)
    if (bucket) bucket.push(toActionView(row))
    else grouped.set(row.roundId, [toActionView(row)])
  }
  return grouped
}

/**
 * 방의 모든 판을 최신순으로, 각 판의 베팅 액션을 `seq` 오름차순으로 돌려준다.
 *
 * 방 스냅샷(`getRoomSnapshot`)은 진행 중인 판의 액션만 싣기 때문에 판을 가로지르는 기록은
 * 여기서 따로 읽는다. 질의는 두 번만 쓴다 — 판 목록 한 번, 그 판들의 액션 한 번(`inArray`).
 * 판마다 액션을 조회하면 N+1이 되고, 100판이면 왕복이 101번이 된다.
 *
 * 이름은 스냅샷의 members가 아니라 여기서 `users`를 조인해 붙인다. 나간 참가자
 * (`room_members.left_at`)는 스냅샷 members에서 빠지지만 그 사람이 남긴 액션은 기록에
 * 그대로 남아 있어서, members로만 이름을 풀면 지난 판이 통째로 "알 수 없음"이 된다.
 *
 * 실패하면 내부 오류를 화면으로 흘리지 않고 null을 돌려준다 (`isAdminUser`와 같은 처리).
 */
export async function getRoomBetHistory(roomId: string): Promise<BetHistoryView | null> {
  try {
    const roundRows = await db
      .select({
        id: rounds.id,
        seq: rounds.seq,
        status: rounds.status,
        pot: rounds.pot,
        winnerId: rounds.winnerId,
        winnerName: users.displayName,
      })
      .from(rounds)
      .leftJoin(users, eq(users.id, rounds.winnerId))
      .where(eq(rounds.roomId, roomId))
      .orderBy(desc(rounds.seq))
      // 상한보다 한 줄 더 읽어서 "더 있다"를 판별한다. count 질의를 따로 두지 않으려는 것.
      .limit(BET_HISTORY_ROUND_CAP + 1)

    const truncated = roundRows.length > BET_HISTORY_ROUND_CAP
    const visibleRounds = truncated ? roundRows.slice(0, BET_HISTORY_ROUND_CAP) : roundRows
    if (visibleRounds.length === 0) {
      return { rounds: [], truncated: false, cap: BET_HISTORY_ROUND_CAP }
    }

    // 같은 users 테이블을 행위자·대리 입력자 두 번 조인하므로 별칭이 필요하다.
    const actor = alias(users, 'actor')
    const proxy = alias(users, 'proxy')

    const actionRows = await db
      .select({
        id: betActions.id,
        roundId: betActions.roundId,
        userId: betActions.userId,
        userName: actor.displayName,
        enteredBy: betActions.enteredBy,
        enteredByName: proxy.displayName,
        action: betActions.action,
        amount: betActions.amount,
        status: betActions.status,
        seq: betActions.seq,
        createdAt: betActions.createdAt,
        reason: betActions.reason,
      })
      .from(betActions)
      .leftJoin(actor, eq(actor.id, betActions.userId))
      .leftJoin(proxy, eq(proxy.id, betActions.enteredBy))
      .where(
        inArray(
          betActions.roundId,
          visibleRounds.map((round) => round.id),
        ),
      )
      .orderBy(asc(betActions.seq))

    const actionsByRound = groupByRound(actionRows)

    return {
      rounds: visibleRounds.map((round) => ({
        roundId: round.id,
        seq: round.seq,
        pot: round.pot,
        status: round.status,
        winnerId: round.winnerId,
        winnerName: round.winnerName,
        actions: actionsByRound.get(round.id) ?? NO_ACTIONS,
      })),
      truncated,
      cap: BET_HISTORY_ROUND_CAP,
    }
  } catch (error) {
    console.error('getRoomBetHistory failed:', error)
    return null
  }
}
