import { schema } from '@/lib/db'
import type { BetActionView } from '../game/types'

/**
 * `placeBet`/`approveBet`가 액션을 accept한 직후 자동 종료(`autoSettleRoundIfComplete`,
 * `game/round-finalize.ts`)가 판을 끝냈으면 그 결과를 응답에 실어 보낸다 — 클라이언트가 별도
 * refetch 없이 즉시 반영할 수 있게.
 */
export interface RoundEndedFromBet {
  readonly seq: number
  readonly pot: number
  readonly winnerId: string
}

/** DB 행 → 클라이언트 뷰. 필드 매핑만 하는 순수 함수, I/O 없음. */
export function toView(action: typeof schema.betActions.$inferSelect): BetActionView {
  return {
    id: action.id,
    roundId: action.roundId,
    userId: action.userId,
    enteredBy: action.enteredBy,
    action: action.action,
    amount: action.amount,
    status: action.status,
    reason: action.reason,
    seq: action.seq,
    createdAt: action.createdAt.toISOString(),
  }
}
