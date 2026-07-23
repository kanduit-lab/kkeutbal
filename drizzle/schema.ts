import {
  boolean,
  index,
  integer,
  jsonb,
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

export const gameType = pgEnum('game_type', ['seotda', 'gostop', 'poker'])
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

/**
 * 전역 사용자. 이메일은 저장하지 않는다 (docs/07-auth-and-security.md).
 * `authentik_sub` 는 provider 신원 키다 — OIDC 는 IdP sub, 내부 계정은 `local:{username}`,
 * 개발 게스트는 `dev:{name}`. SSO 로그인 시 아이디 또는 전화번호가 일치하는 내부 계정이 있으면
 * 그 행의 `authentik_sub` 를 OIDC sub 로 교체해 같은 계정으로 병합한다.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  authentikSub: text('authentik_sub').notNull().unique(),
  /** 내부 계정 아이디. SSO·게스트 전용 사용자는 null. */
  username: text('username').unique(),
  /** bcrypt 해시. 내부 계정만 가진다. */
  passwordHash: text('password_hash'),
  /** 전화번호(숫자만, 예: 01012345678). SSO 자동 연동의 병합 기준. */
  phone: text('phone').unique(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  /** 관리자 — 게스트 토큰 발급·관리자 지정 권한. 부트스트랩은 AUTH_ADMIN_USERNAMES env. */
  isAdmin: boolean('is_admin').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * 게스트 초대 토큰. 관리자가 발급하며, 코드 + 이름만으로 게스트 로그인할 수 있다.
 * 같은 (토큰, 이름) 조합은 같은 게스트 계정으로 이어진다 — 기기를 바꿔도 전적 유지.
 */
export const guestTokens = pgTable('guest_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** 입장 코드와 같은 문자 집합(혼동 문자 제외) 8자. */
  code: text('code').notNull().unique(),
  /** 발급 메모 (예: "2026 여름 MT"). */
  label: text('label').notNull(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const rooms = pgTable(
  'rooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** 6자 입장 코드. 혼동 문자(0/O, 1/I) 제외. */
    code: text('code').notNull().unique(),
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
    /** 판별 팟 계산(getRoundPot: roundId + reason 필터)용. */
    index('chip_ledger_round_reason_idx').on(table.roundId, table.reason),
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
