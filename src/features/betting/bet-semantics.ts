import { and, asc, desc, eq, lt } from 'drizzle-orm'
import { schema } from '@/lib/db'
import {
  activeRoundParticipantIds,
  balanceInRoom,
  defaultBaseBet,
  readBaseBet,
  readRaiseRule,
  type Tx,
} from '../game/action-helpers'
import { isActorsTurn } from '../game/turn-order'
import type { BetActionKind } from '../game/types'
import { checkBetAmount } from './bet-amount-rule'
import { roundBetState } from './round-bet-state'
import { computeRoundCompletion } from './round-completion'

const { betActions } = schema

/**
 * 베팅 액션의 의미 검증 허브 — `placeBet`(신규 액션)과 `approveBet`(대기 중이던 액션을 뒤늦게
 * 재검증할 때, `beforeSeq`로 그 액션 제출 시점 기준까지의 액션만 보고 판단)이 공유한다.
 *
 * 판정 순서(바꾸면 사용자에게 보이는 에러가 달라진다):
 * 1. 직전 accepted 액션이 fold·allin이면 더 이상 액션 불가
 * 2. 라운드가 이미 완료 게이트(1인 생존·콜 완료)에 들었으면 거부 — 정상적으로는 그 직후
 *    자동 종료가 판을 끝내지만, 자동 종료가 미뤄진 사이 낀 요청을 막는 안전망이다.
 * 3. 차례가 아니면 거부 — `turn-order.ts`(UI 하이라이트와 같은 순수 함수)로 판정.
 * 4. 금액·잔액·레이즈 규칙 판정은 `bet-amount-rule.ts`의 `checkBetAmount`(순수 함수)에 위임.
 *
 * 위반이면 i18n 에러 키, 통과면 `null`.
 */
export async function validateBetSemantics(
  tx: Tx,
  input: {
    room: typeof schema.rooms.$inferSelect
    roundId: string
    userId: string
    action: BetActionKind
    amount: number
    beforeSeq?: number
  },
): Promise<string | null> {
  const { room, roundId, userId, action, amount, beforeSeq } = input
  const before = beforeSeq === undefined ? undefined : lt(betActions.seq, beforeSeq)

  const [lastUserAction] = await tx
    .select({ action: betActions.action })
    .from(betActions)
    .where(
      and(
        eq(betActions.roundId, roundId),
        eq(betActions.userId, userId),
        eq(betActions.status, 'accepted'),
        before,
      ),
    )
    .orderBy(desc(betActions.seq))
    .limit(1)
  if (lastUserAction?.action === 'fold') return 'errors.cannotBetAfterFold'
  if (lastUserAction?.action === 'allin') return 'errors.cannotBetAfterAllIn'

  const acceptedActions = await tx
    .select({
      userId: betActions.userId,
      action: betActions.action,
      amount: betActions.amount,
      status: betActions.status,
      seq: betActions.seq,
    })
    .from(betActions)
    .where(and(eq(betActions.roundId, roundId), eq(betActions.status, 'accepted'), before))
    .orderBy(asc(betActions.seq))

  // 베팅 라운드가 이미 콜 완료(쇼다운 대기) 또는 1인 생존 상태면 더 이상 액션을 받지 않는다 —
  // 정상적으로는 그 직후 자동 종료(`autoSettleRoundIfComplete`)가 판을 끝내지만, 공정 딜
  // 봉인 대기처럼 자동 종료가 미뤄진 사이 낀 요청까지 막는 안전망이다.
  const participantIds = await activeRoundParticipantIds(tx, room.id, roundId)
  const completion = computeRoundCompletion(participantIds, acceptedActions)
  if (completion.kind !== 'active') return 'errors.roundAwaitingWinner'

  // 차례 강제. UI 하이라이트와 같은 순수 함수(`turn-order.ts`)로 판정한다.
  if (!isActorsTurn(participantIds, acceptedActions, userId)) return 'errors.notYourTurn'

  const state = roundBetState(acceptedActions)
  const balance = await balanceInRoom(tx, room.id, userId)
  const baseBet = readBaseBet(room.rulePreset) ?? defaultBaseBet(room.startingChips)

  return checkBetAmount({
    state,
    userId,
    action,
    amount,
    balance,
    baseBet,
    raiseRule: readRaiseRule(room.rulePreset),
  })
}
