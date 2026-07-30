import { beforeAll, describe, expect, it, vi } from 'vitest'

// 액션이 세션에서 호출자를 얻으므로(`currentUserId`) 그 한 지점만 갈아끼운다. 이 홀더를
// `vi.hoisted`로 만드는 이유: vi.mock 팩토리는 import보다 먼저 hoist되어 실행되므로, 모듈
// 본문에서 선언한 변수를 참조하면 TDZ 에러가 난다.
const acting = vi.hoisted(() => ({ userId: null as string | null }))

vi.mock('server-only', () => ({}))
vi.mock('@/features/auth/session', () => ({
  currentUserId: async () => acting.userId,
}))

import { and, eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { createRoom, joinRoom } from '@/features/game/actions'
import { startRound } from '@/features/game/round-actions'
import { leaveRoom, removeMember } from '@/features/game/member-actions'
import { approveBet, placeBet } from '@/features/betting/actions'
import {
  acceptedBets,
  balanceOf,
  INTEGRATION_ENABLED,
  INTEGRATION_SKIP_REASON,
  integrationRoomName,
  participantsInSeatOrder,
  playingRoundCount,
  resolveActors,
  type IntegrationActors,
} from './harness'

/**
 * Server Action 상태머신 통합 테스트 — 실제 DB 트랜잭션으로 돈다.
 *
 * 검증 대상은 순수 함수가 아니라 **트랜잭션 경계와 직렬화**다: advisory lock이 동시 요청을
 * 실제로 줄 세우는지, 차례 강제가 서버에서 통하는지, 판중 퇴장·강퇴가 거부되는지, 승인이
 * 순서대로만 처리되는지. 목으로는 아무것도 증명되지 않아서 실제 DB를 쓴다.
 *
 * 켜는 방법과 남는 데이터에 대한 설명은 `harness.ts` 참고. 기본은 꺼짐이다.
 */
const STARTING_CHIPS = 1_000
const BASE_BET = 10

function uuid(): string {
  return crypto.randomUUID()
}

async function act<T>(userId: string, run: () => Promise<T>): Promise<T> {
  acting.userId = userId
  try {
    return await run()
  } finally {
    acting.userId = null
  }
}

async function createTrustRoom(
  actors: IntegrationActors,
  label: string,
  inputMode: 'trust' | 'approval' = 'trust',
): Promise<{ roomId: string; code: string }> {
  const created = await act(actors.host, () =>
    createRoom({
      name: integrationRoomName(label, Date.now()),
      gameType: 'seotda',
      inputMode,
      startingChips: STARTING_CHIPS,
      baseBet: BASE_BET,
      fundingMode: 'session',
      raiseRule: 'free',
    }),
  )
  if (!created.success) throw new Error(`createRoom failed: ${created.error}`)
  const code = created.data.code

  for (const userId of [actors.second, actors.third]) {
    const joined = await act(userId, () => joinRoom(code))
    if (!joined.success) throw new Error(`joinRoom failed for ${userId}: ${joined.error}`)
  }

  const [room] = await db
    .select({ id: schema.rooms.id })
    .from(schema.rooms)
    .where(eq(schema.rooms.code, code))
    .limit(1)
  if (!room) throw new Error('room row missing after createRoom')
  return { roomId: room.id, code }
}

describe.skipIf(!INTEGRATION_ENABLED)(
  `Server Action 상태머신 (실제 DB)${INTEGRATION_ENABLED ? '' : ` — skipped: ${INTEGRATION_SKIP_REASON}`}`,
  () => {
    let actors: IntegrationActors

    beforeAll(async () => {
      actors = await resolveActors()
    }, 30_000)

    it('동시 판 시작 요청은 판을 하나만 만든다', async () => {
      const { roomId } = await createTrustRoom(actors, 'concurrent-start')

      // 같은 방장이 두 번 눌렀거나, 방장과 딜러가 동시에 눌렀을 때. 방 단위 advisory lock이
      // 직렬화하므로 뒤에 들어온 쪽은 "이미 진행 중"을 봐야 한다.
      const [first, second] = await Promise.all([
        act(actors.host, () => startRound(roomId)),
        act(actors.host, () => startRound(roomId)),
      ])

      const outcomes = [first, second]
      expect(outcomes.filter((result) => result.success)).toHaveLength(1)
      const rejected = outcomes.find((result) => !result.success)
      expect(rejected && !rejected.success ? rejected.error : null).toBe(
        'errors.roundAlreadyActive',
      )
      expect(await playingRoundCount(roomId)).toBe(1)
    }, 60_000)

    it('차례가 아닌 사람의 베팅을 거부하고, 누적 기여액 기준으로 금액을 검증한다', async () => {
      const { roomId } = await createTrustRoom(actors, 'turn-and-raise')
      const started = await act(actors.host, () => startRound(roomId))
      expect(started.success).toBe(true)
      if (!started.success) return
      const roundId = started.data.roundId

      const seats = await participantsInSeatOrder(roomId, roundId)
      expect(seats).toHaveLength(3)
      const [first, next, last] = seats as [string, string, string]

      // 1. 차례가 아닌 사람은 금액이 맞아도 거부된다. 이게 없으면 한 사람이 연속으로 베팅할 수 있다.
      const outOfTurn = await act(next, () =>
        placeBet({ actionId: uuid(), roomId, action: 'raise', amount: BASE_BET }),
      )
      expect(outOfTurn.success).toBe(false)
      expect(!outOfTurn.success ? outOfTurn.error : null).toBe('errors.notYourTurn')

      // 2. 첫 베팅의 최소액은 baseBet이다.
      const tooSmall = await act(first, () =>
        placeBet({ actionId: uuid(), roomId, action: 'raise', amount: BASE_BET - 1 }),
      )
      expect(!tooSmall.success ? tooSmall.error : null).toBe('errors.raiseBelowMinimum')

      const opened = await act(first, () =>
        placeBet({ actionId: uuid(), roomId, action: 'raise', amount: BASE_BET }),
      )
      expect(opened.success).toBe(true)

      // 3. 두 번째 사람의 레이즈 최소액은 "콜 필요액 + 1"이다. 직전 베팅과 같은 금액(=콜 금액)은
      //    레이즈가 아니므로 거부돼야 한다 — 금액을 증분이 아니라 누적으로 착각하면 통과해버린다.
      const sameAsCall = await act(next, () =>
        placeBet({ actionId: uuid(), roomId, action: 'raise', amount: BASE_BET }),
      )
      expect(!sameAsCall.success ? sameAsCall.error : null).toBe('errors.raiseBelowMinimum')

      const reraised = await act(next, () =>
        placeBet({ actionId: uuid(), roomId, action: 'raise', amount: BASE_BET + 1 }),
      )
      expect(reraised.success).toBe(true)

      // 4. 세 번째 사람은 최고 기여액을 맞춰야 한다.
      const called = await act(last, () =>
        placeBet({ actionId: uuid(), roomId, action: 'call', amount: BASE_BET + 1 }),
      )
      expect(called.success).toBe(true)

      // 5. 첫 번째 사람의 콜 금액은 "최고 기여액 − 내 기여액" = 1이다. 누적 총액(11)을 보내면
      //    거부된다. 증분/누적 혼동을 실제로 잡는 단정이다.
      const wrongCall = await act(first, () =>
        placeBet({ actionId: uuid(), roomId, action: 'call', amount: BASE_BET + 1 }),
      )
      expect(!wrongCall.success ? wrongCall.error : null).toBe('errors.invalidCallAmount')

      const evenCall = await act(first, () =>
        placeBet({ actionId: uuid(), roomId, action: 'call', amount: 1 }),
      )
      expect(evenCall.success).toBe(true)

      // 6. 전원이 같은 금액을 냈으므로 베팅 라운드는 쇼다운 대기다. 비검증 방은 서버가 카드를
      //    몰라 자동 정산하지 않고 딜러 확정을 기다리며, 그 사이 들어온 액션은 거부된다.
      const afterShowdown = await act(next, () =>
        placeBet({ actionId: uuid(), roomId, action: 'raise', amount: 100 }),
      )
      expect(!afterShowdown.success ? afterShowdown.error : null).toBe('errors.roundAwaitingWinner')

      // 7. 원장이 액션과 일치한다 — 세 사람 모두 11칩씩 냈다.
      for (const userId of seats) {
        expect(await balanceOf(roomId, userId)).toBe(STARTING_CHIPS - (BASE_BET + 1))
      }
      const bets = await acceptedBets(roundId)
      expect(bets.filter((bet) => bet.status === 'accepted')).toHaveLength(4)
    }, 90_000)

    it('같은 actionId로 동시에 들어온 베팅은 한 번만 반영된다', async () => {
      const { roomId } = await createTrustRoom(actors, 'idempotent-bet')
      const started = await act(actors.host, () => startRound(roomId))
      expect(started.success).toBe(true)
      if (!started.success) return
      const roundId = started.data.roundId

      const seats = await participantsInSeatOrder(roomId, roundId)
      const first = seats[0]!
      // 네트워크 재시도·더블탭이 같은 클라이언트 UUID로 두 번 도착하는 경우.
      const actionId = uuid()
      const results = await Promise.all([
        act(first, () => placeBet({ actionId, roomId, action: 'raise', amount: BASE_BET })),
        act(first, () => placeBet({ actionId, roomId, action: 'raise', amount: BASE_BET })),
      ])
      expect(results.every((result) => result.success)).toBe(true)

      const bets = await acceptedBets(roundId)
      expect(bets).toHaveLength(1)
      expect(await balanceOf(roomId, first)).toBe(STARTING_CHIPS - BASE_BET)

      // 다른 actionId로 연속 베팅하면 차례가 넘어가 있으므로 거부된다.
      const again = await act(first, () =>
        placeBet({ actionId: uuid(), roomId, action: 'raise', amount: BASE_BET * 3 }),
      )
      expect(!again.success ? again.error : null).toBe('errors.notYourTurn')
    }, 90_000)

    it('판이 도는 중에는 스스로 나가지도, 강퇴되지도 않는다', async () => {
      const { roomId } = await createTrustRoom(actors, 'leave-during-round')
      const started = await act(actors.host, () => startRound(roomId))
      expect(started.success).toBe(true)
      if (!started.success) return

      const left = await act(actors.second, () => leaveRoom({ roomId }))
      expect(!left.success ? left.error : null).toBe('errors.cannotLeaveDuringRound')

      const kicked = await act(actors.host, () =>
        removeMember({ roomId, targetUserId: actors.second }),
      )
      expect(!kicked.success ? kicked.error : null).toBe('errors.cannotRemoveDuringRound')

      // 거부됐으니 멤버 행이 그대로 살아 있어야 한다 — 실패했는데 부분 반영되면 더 나쁘다.
      const [member] = await db
        .select({ leftAt: schema.roomMembers.leftAt })
        .from(schema.roomMembers)
        .where(
          and(eq(schema.roomMembers.roomId, roomId), eq(schema.roomMembers.userId, actors.second)),
        )
        .limit(1)
      expect(member?.leftAt ?? null).toBeNull()
    }, 90_000)

    it('승인 모드에서는 대기 중 베팅이 순서대로만 승인된다', async () => {
      const { roomId } = await createTrustRoom(actors, 'approval-order', 'approval')
      const started = await act(actors.host, () => startRound(roomId))
      expect(started.success).toBe(true)
      if (!started.success) return
      const roundId = started.data.roundId

      const seats = await participantsInSeatOrder(roomId, roundId)
      expect(seats).toHaveLength(3)
      const firstActor = seats[0]!

      // 방장(=딜러)의 베팅은 승인 모드에서도 즉시 accepted된다. "선"이 방장이면 대기 상태는 그
      // 다음 사람에게서 생기므로, 방장 베팅을 먼저 흘려 차례를 넘긴다.
      if (firstActor === actors.host) {
        const hostBet = await act(actors.host, () =>
          placeBet({ actionId: uuid(), roomId, action: 'raise', amount: BASE_BET }),
        )
        expect(hostBet.success).toBe(true)
      }

      const pendingActor = firstActor === actors.host ? seats[1]! : firstActor
      const pendingAction = firstActor === actors.host ? 'call' : 'raise'
      const submitted = await act(pendingActor, () =>
        placeBet({ actionId: uuid(), roomId, action: pendingAction, amount: BASE_BET }),
      )
      expect(submitted.success).toBe(true)
      if (!submitted.success) return
      expect(submitted.data.action.status).toBe('pending')
      // 승인 전에는 칩이 움직이지 않는다 — 원장 행이 생기면 승인 절차가 무의미해진다.
      expect(await balanceOf(roomId, pendingActor)).toBe(STARTING_CHIPS)

      // 대기 상태에서는 차례가 넘어가지 않는다(차례 계산은 accepted 액션만 본다). 그래서 다른
      // 사람은 물론 딜러 자신도 새 액션을 낼 수 없다.
      //
      // 참고로 `placeBet`에는 "대기 중 베팅이 있으면 딜러의 새 액션을 막는다"
      // (`errors.pendingBetsBeforeNewAction`) 분기가 따로 있는데, 차례 강제가 먼저 걸리므로 정상
      // 경로에서는 그 분기까지 도달하지 않는다 — 차례 강제가 들어오기 전에 만들어진 방어선이다.
      const dealerJumpsQueue = await act(actors.host, () =>
        placeBet({ actionId: uuid(), roomId, action: 'raise', amount: BASE_BET * 5 }),
      )
      expect(!dealerJumpsQueue.success ? dealerJumpsQueue.error : null).toBe('errors.notYourTurn')

      // 승인 순서 가드를 확인하려면 앞선 대기 행이 있는 상태에서 뒤의 것을 승인해 봐야 한다.
      // 정상 경로로는 대기 행이 둘 생기지 않으므로(위 이유), 더 **뒤쪽** seq에 대기 행을 하나 직접
      // 넣고 그것을 승인해 본다 — 그러면 진짜 대기 행이 "앞선 것"이 되어 가드가 걸린다. 이 가드는
      // 원래 이런 비정상 상태를 위해 존재한다. (bet_actions에는 append-only 트리거가 없어 정리 가능하다.)
      const laterActionId = submitted.data.action.id
      const [maxSeqRow] = await db
        .select({ maxSeq: sql<number>`coalesce(max(${schema.betActions.seq}), 0)` })
        .from(schema.betActions)
        .where(eq(schema.betActions.roundId, roundId))
      const syntheticId = uuid()
      const otherUserId = seats.find((userId) => userId !== pendingActor && userId !== actors.host)!
      await db.insert(schema.betActions).values({
        id: syntheticId,
        roomId,
        roundId,
        userId: otherUserId,
        action: 'raise',
        amount: BASE_BET,
        status: 'pending',
        seq: Number(maxSeqRow?.maxSeq ?? 0) + 1,
      })

      try {
        const outOfOrder = await act(actors.host, () => approveBet({ actionId: syntheticId }))
        expect(!outOfOrder.success ? outOfOrder.error : null).toBe('errors.approvePendingInOrder')
      } finally {
        await db.delete(schema.betActions).where(eq(schema.betActions.id, syntheticId))
      }

      // 앞선 대기 행이 사라지면 승인이 통과하고, 그때 비로소 칩이 움직인다.
      const approved = await act(actors.host, () => approveBet({ actionId: laterActionId }))
      expect(approved.success).toBe(true)
      expect(await balanceOf(roomId, pendingActor)).toBe(STARTING_CHIPS - BASE_BET)
    }, 120_000)
  },
)
