import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * 스키마 구현. 설계 근거·불변식은 docs/02-data-model.md 가 소유한다.
 * RLS 정책과 realtime 설정은 supabase/migrations/*.sql 이 소유한다 (여기 아님).
 */

export const gameType = pgEnum('game_type', ['seotda', 'gostop'])
export const roomStatus = pgEnum('room_status', ['waiting', 'playing', 'settled', 'closed'])
export const inputMode = pgEnum('input_mode', ['trust', 'approval'])
export const memberRole = pgEnum('member_role', ['host', 'dealer', 'player', 'observer'])
export const roundStatus = pgEnum('round_status', ['playing', 'ended', 'voided'])
export const betAction = pgEnum('bet_action', ['check', 'call', 'raise', 'fold', 'allin'])
export const actionStatus = pgEnum('action_status', [
  'pending',
  'accepted',
  'rejected',
  'reverted',
])
export const chipReason = pgEnum('chip_reason', [
  'buy_in',
  'bet',
  'pot_win',
  'correction',
  'settlement',
])
export const handSource = pgEnum('hand_source', ['manual', 'vision'])

/** Authentik 신원의 로컬 미러. 이메일은 저장하지 않는다 (docs/07-auth-and-security.md). */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  authentikSub: text('authentik_sub').notNull().unique(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** 누적 랭킹의 범위 단위. 전역 랭킹은 만들지 않는다. */
export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const groupMembers = pgTable(
  'group_members',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.groupId, table.userId] })],
)

export const rooms = pgTable(
  'rooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** 6자 입장 코드. 혼동 문자(0/O, 1/I) 제외. */
    code: text('code').notNull().unique(),
    groupId: uuid('group_id').references(() => groups.id),
    hostId: uuid('host_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    gameType: gameType('game_type').notNull(),
    status: roomStatus('status').notNull().default('waiting'),
    inputMode: inputMode('input_mode').notNull().default('trust'),
    /** 룰 항목이 게임마다 다르고 자주 늘어난다. 질의 대상이 아니라 엔진 입력값이므로 jsonb. */
    rulePreset: jsonb('rule_preset').notNull().default({}),
    startingChips: integer('starting_chips').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (table) => [index('rooms_status_idx').on(table.status)],
)

export const roomMembers = pgTable(
  'room_members',
  {
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRole('role').notNull().default('player'),
    seatNo: integer('seat_no').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    /** 나가도 행을 지우지 않는다 — 과거 판의 참가 기록이 필요하다 (soft leave). */
    leftAt: timestamp('left_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.roomId, table.userId] }),
    unique('room_members_seat_uq').on(table.roomId, table.seatNo),
  ],
)

export const rounds = pgTable(
  'rounds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    /** 방 내 판 번호. 동시 입력 충돌 판정의 기준. */
    seq: integer('seq').notNull(),
    status: roundStatus('status').notNull().default('playing'),
    pot: integer('pot').notNull().default(0),
    winnerId: uuid('winner_id').references(() => users.id),
    /** 게임별 결과 상세 (섯다: 족보 / 고스톱: 점수 내역). */
    result: jsonb('result'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (table) => [unique('rounds_room_seq_uq').on(table.roomId, table.seq)],
)

export const betActions = pgTable(
  'bet_actions',
  {
    /** 클라이언트가 생성한 UUID = 멱등키. 재전송은 PK 충돌로 흡수된다. */
    id: uuid('id').primaryKey(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    roundId: uuid('round_id')
      .notNull()
      .references(() => rounds.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /** 대리 입력 시 실제 입력자. 본인 입력이면 null. */
    enteredBy: uuid('entered_by').references(() => users.id),
    action: betAction('action').notNull(),
    amount: integer('amount').notNull().default(0),
    status: actionStatus('status').notNull().default('pending'),
    approvedBy: uuid('approved_by').references(() => users.id),
    /** 거절·정정 사유. 사유 없는 거절은 분쟁을 만든다. */
    reason: text('reason'),
    /** 서버가 커밋 시 확정하는 판 내 순번. */
    seq: integer('seq').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('bet_actions_round_seq_idx').on(table.roundId, table.seq)],
)

/**
 * 칩 원장. append-only.
 * 잔액 컬럼을 두지 않고 여기 합계로 도출한다 — 근거는 docs/02-data-model.md "칩은 원장이다".
 * UPDATE/DELETE 는 RLS 와 트리거로 금지한다.
 */
export const chipLedger = pgTable(
  'chip_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    roundId: uuid('round_id').references(() => rounds.id, { onDelete: 'set null' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /** 부호 있는 정수. 지출 음수, 획득 양수. */
    delta: integer('delta').notNull(),
    reason: chipReason('reason').notNull(),
    refActionId: uuid('ref_action_id').references(() => betActions.id),
    /** 정정 행이 원본을 가리킨다. 원본은 수정하지 않는다. */
    revertedOf: uuid('reverted_of'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('chip_ledger_room_user_idx').on(table.roomId, table.userId),
    index('chip_ledger_room_time_idx').on(table.roomId, table.createdAt),
  ],
)

export const buyIns = pgTable(
  'buy_ins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    amount: integer('amount').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('buy_ins_room_user_idx').on(table.roomId, table.userId)],
)

/** 족보 판독 기록. 기본 가시성은 본인, 판 종료 후 방 공개 (docs/05-jokbo-advisor.md). */
export const handRecords = pgTable(
  'hand_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roundId: uuid('round_id')
      .notNull()
      .references(() => rounds.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /** HwatuCard.id 배열. UI·vision·DB 가 같은 키를 쓴다. */
    cards: jsonb('cards').notNull(),
    rankLabel: text('rank_label'),
    rankScore: integer('rank_score'),
    source: handSource('source').notNull().default('manual'),
    confidence: numeric('confidence', { precision: 4, scale: 3 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('hand_records_round_user_uq').on(table.roundId, table.userId)],
)
