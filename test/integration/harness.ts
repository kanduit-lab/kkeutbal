import { and, eq, inArray, sql } from 'drizzle-orm'

// vitest는 `.env.local`을 읽지 않는다(Next가 앱 프로세스에서 읽어주는 것뿐이다). 아래 플래그와
// DB 접속 정보가 전부 여기서 나오므로, 이 모듈 본문이 가장 먼저 실행되도록 스펙이 이 파일을
// import한 뒤에 process.env를 읽는다. 파일이 없는 환경(CI)도 있으니 실패는 무시한다.
try {
  process.loadEnvFile('.env.local')
} catch {
  // .env.local이 없으면 셸 환경변수만 쓴다 — 그 경우 INTEGRATION_DB가 없어 전부 skip된다.
}

/**
 * Server Action 통합 테스트 공용 셋업.
 *
 * ## 왜 이 테스트가 기본으로 꺼져 있나
 *
 * Server Action은 각자 `db.transaction()`을 직접 연다. 그래서 테스트가 밖에서 트랜잭션을 열고
 * 끝에 롤백하는 방식이 통하지 않는다 — 액션은 별도 커넥션에서 자기 트랜잭션을 커밋한다.
 * 게다가 `chip_ledger`는 append-only 트리거가 UPDATE·DELETE를 예외로 막고, `chip_ledger.room_id`
 * FK가 `on delete cascade`라서 **원장 행이 생긴 방은 삭제 자체가 불가능하다.** 방 생성이
 * 초기 바이인 원장 행을 만들므로 이 테스트는 지울 수 없는 잔여 데이터를 남긴다.
 *
 * 그래서 `INTEGRATION_DB=true`(`.env.local`)일 때만 돈다. 남는 데이터는 두 가지로 눌러 뒀다:
 * 방 이름에 `[int]` 접두사를 붙여 식별 가능하게 하고, **정산하지 않아서** 누적 랭킹 집계
 * (`settled`/`closed` 방만 본다)에 들어가지 않게 한다.
 *
 * ## 왜 실제 DB인가
 *
 * 검증 대상이 advisory lock 직렬화, 트리거, UNIQUE 제약, 트랜잭션 경계다 — 목으로는 아무것도
 * 증명되지 않는다. e2e는 정상 경로만 훑고 경쟁 상태를 브라우저로 재현하기 어렵다. 그 사이를
 * 메우는 층이다.
 */

/** `vi.mock('@/features/auth/session', ...)`이 읽는 "지금 이 액션을 호출하는 사람". */
export interface ActingUser {
  userId: string | null
}

export const INTEGRATION_ENABLED = process.env.INTEGRATION_DB === 'true'

export const INTEGRATION_SKIP_REASON =
  'Set INTEGRATION_DB=true in .env.local to run the DB integration tests (writes rows that cannot be deleted).'

/** 테스트에서 쓰는 전용 계정 — e2e와 같은 계정을 재사용한다. */
export const INTEGRATION_ACCOUNTS = ['testadmin1', 'testadmin2', 'testadmin3'] as const

export interface IntegrationActors {
  readonly host: string
  readonly second: string
  readonly third: string
}

export async function resolveActors(): Promise<IntegrationActors> {
  const { db, schema } = await import('@/lib/db')
  const rows = await db
    .select({ id: schema.users.id, username: schema.users.username })
    .from(schema.users)
    .where(inArray(schema.users.username, [...INTEGRATION_ACCOUNTS]))

  const byName = new Map(rows.map((row) => [row.username, row.id]))
  const [host, second, third] = INTEGRATION_ACCOUNTS.map((name) => byName.get(name))
  if (!host || !second || !third) {
    throw new Error(
      `integration accounts missing: ${INTEGRATION_ACCOUNTS.filter((n) => !byName.get(n)).join(', ')}`,
    )
  }
  return { host, second, third }
}

/**
 * 방 이름 — `[int]` 접두사로 남는 데이터를 식별할 수 있게 하고, 뒤에 타임스탬프를 붙여 실행마다
 * 구분한다. `createRoom`의 이름 상한이 30자라 넘치면 라벨을 자른다(타임스탬프는 지킨다) —
 * 넘겼을 때 나오는 에러가 `errors.invalidInput` 하나뿐이라 원인을 찾기 어렵다.
 */
export function integrationRoomName(label: string, now: number): string {
  const stamp = now.toString(36)
  const head = `[int] ${label}`.slice(0, 30 - stamp.length - 1)
  return `${head} ${stamp}`
}

/** 이 방에서 한 사용자의 현재 칩 잔액 — 원장 합계. 액션이 실제로 칩을 움직였는지 확인용. */
export async function balanceOf(roomId: string, userId: string): Promise<number> {
  const { db, schema } = await import('@/lib/db')
  const [row] = await db
    .select({ balance: sql<string>`coalesce(sum(${schema.chipLedger.delta}), 0)::text` })
    .from(schema.chipLedger)
    .where(and(eq(schema.chipLedger.roomId, roomId), eq(schema.chipLedger.userId, userId)))
  return Number(row?.balance ?? '0')
}

/** 이 판에 쌓인 accepted 베팅 액션 — 순서(seq)까지 확인할 수 있게 그대로 돌려준다. */
export async function acceptedBets(roundId: string) {
  const { db, schema } = await import('@/lib/db')
  return db
    .select({
      userId: schema.betActions.userId,
      action: schema.betActions.action,
      amount: schema.betActions.amount,
      status: schema.betActions.status,
      seq: schema.betActions.seq,
    })
    .from(schema.betActions)
    .where(eq(schema.betActions.roundId, roundId))
    .orderBy(schema.betActions.seq)
}

/** 이 방의 진행 중인 판 개수 — 동시 startRound가 판을 두 개 만들지 않는지 확인용. */
export async function playingRoundCount(roomId: string): Promise<number> {
  const { db, schema } = await import('@/lib/db')
  const rows = await db
    .select({ id: schema.rounds.id })
    .from(schema.rounds)
    .where(and(eq(schema.rounds.roomId, roomId), eq(schema.rounds.status, 'playing')))
  return rows.length
}

/** 이 판의 참가자 id — seatNo 오름차순. "선"은 index 0이다(`turn-order.ts`). */
export async function participantsInSeatOrder(
  roomId: string,
  roundId: string,
): Promise<readonly string[]> {
  const { db, schema } = await import('@/lib/db')
  const rows = await db
    .select({ userId: schema.roomMembers.userId })
    .from(schema.roundParticipants)
    .innerJoin(
      schema.roomMembers,
      and(
        eq(schema.roomMembers.roomId, roomId),
        eq(schema.roomMembers.userId, schema.roundParticipants.userId),
      ),
    )
    .where(eq(schema.roundParticipants.roundId, roundId))
    .orderBy(schema.roomMembers.seatNo)
  return rows.map((row) => row.userId)
}
