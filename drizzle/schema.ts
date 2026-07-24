import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

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
export const actionStatus = pgEnum('action_status', ['pending', 'accepted', 'rejected', 'reverted'])
export const promotionKind = pgEnum('promotion_kind', ['banner', 'popup'])
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
  /** 관리자 — 게스트 토큰 발급·관리자 지정·SSO 설정 권한. */
  isAdmin: boolean('is_admin').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * 인스턴스 단위 인증 설정. SSO 비밀값은 AUTH_SECRET 기반 AES-GCM 암호문으로만 보관한다.
 * id 는 항상 `default` 한 행만 사용한다.
 */
export const authSettings = pgTable('auth_settings', {
  id: text('id').primaryKey().default('default'),
  ssoEnabled: boolean('sso_enabled').notNull().default(false),
  ssoIssuer: text('sso_issuer'),
  ssoClientId: text('sso_client_id'),
  ssoClientSecretCiphertext: text('sso_client_secret_ciphertext'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * 로그인·가입코드·Vision 호출 제한 버킷.
 * 식별자는 AUTH_SECRET HMAC으로만 저장해 IP·아이디 원문을 남기지 않는다.
 */
export const rateLimitBuckets = pgTable(
  'rate_limit_buckets',
  {
    scope: text('scope').notNull(),
    keyHash: text('key_hash').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    hits: integer('hits').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.scope, table.keyHash] }),
    index('rate_limit_buckets_expires_at_idx').on(table.expiresAt),
    check('rate_limit_buckets_hits_positive_ck', sql`${table.hits} > 0`),
  ],
)

/**
 * 게스트 초대 토큰. 관리자가 발급하며, 코드 + 이름만으로 게스트 로그인할 수 있다.
 * 같은 (토큰, 이름) 조합은 같은 게스트 계정으로 이어진다 — 기기를 바꿔도 전적 유지.
 */
export const guestTokens = pgTable('guest_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** 레거시 원문. 사용 시 codeHash 로 전환하며 신규 발급에는 저장하지 않는다. */
  code: text('code').unique(),
  /** 입장 코드의 AUTH_SECRET HMAC. */
  codeHash: text('code_hash').unique(),
  /** 발급 메모 (예: "2026 여름 MT"). */
  label: text('label').notNull(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('guest_tokens_credential_present_ck', sql`${table.codeHash} is not null or ${table.code} is not null`),
])

/**
 * 내부 계정 회원가입 코드. 원문은 발급 직후 한 번만 보여주고, DB에는 AUTH_SECRET 기반 HMAC만 저장한다.
 * 관리자는 만료·회수할 수 있으며, 같은 코드를 다시 조회할 수 없다.
 */
export const registrationCodes = pgTable(
  'registration_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    codeHash: text('code_hash').notNull().unique(),
    /** 발급 목적을 식별하는 운영 메모. */
    label: text('label').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('registration_codes_expires_at_idx').on(table.expiresAt)],
)

/**
 * 공지·광고 슬롯. `banner` 는 화면 상단 띠, `popup` 은 진입 시 모달로 뜬다.
 * 노출 조건은 `is_active` + `starts_at`/`ends_at` 창이며, 같은 kind 안에서는
 * `priority` 가 큰 행이 먼저다 — 배너는 전부, 팝업은 가장 앞의 하나만 띄운다.
 * "N시간 동안 보지 않기" 의 N 이 `dismiss_hours` 다. 닫음 상태는 서버에 두지 않고
 * 브라우저 localStorage 에만 남긴다 — 비로그인 게스트도 같은 규칙으로 동작한다.
 */
export const promotions = pgTable(
  'promotions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: promotionKind('kind').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    /** 눌렀을 때 이동할 주소. 없으면 링크 없이 문구만 보여준다. */
    linkUrl: text('link_url'),
    linkLabel: text('link_label'),
    isActive: boolean('is_active').notNull().default(true),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    priority: integer('priority').notNull().default(0),
    dismissHours: integer('dismiss_hours').notNull().default(24),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('promotions_kind_active_idx').on(table.kind, table.isActive)],
)

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
  (table) => [
    index('rooms_status_idx').on(table.status),
    check('rooms_starting_chips_positive_ck', sql`${table.startingChips} > 0`),
  ],
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
    check('room_members_seat_nonnegative_ck', sql`${table.seatNo} >= 0`),
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
    pot: bigint('pot', { mode: 'number' }).notNull().default(0),
    winnerId: uuid('winner_id').references(() => users.id),
    /** 게임별 결과 상세 (섯다: 족보 / 고스톱: 점수 내역). */
    result: jsonb('result'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (table) => [
    unique('rounds_room_seq_uq').on(table.roomId, table.seq),
    check('rounds_seq_positive_ck', sql`${table.seq} > 0`),
    check('rounds_pot_nonnegative_ck', sql`${table.pot} >= 0`),
    uniqueIndex('rounds_one_playing_per_room_uq')
      .on(table.roomId)
      .where(sql`${table.status} = 'playing'`),
  ],
)

/** 판 시작 시점의 참가자 스냅샷. 재입장·역할 변경 뒤에도 과거 판 참가 사실을 보존한다. */
export const roundParticipants = pgTable(
  'round_participants',
  {
    roundId: uuid('round_id')
      .notNull()
      .references(() => rounds.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    primaryKey({ columns: [table.roundId, table.userId] }),
    index('round_participants_user_idx').on(table.userId),
  ],
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
  (table) => [
    uniqueIndex('bet_actions_round_seq_uq').on(table.roundId, table.seq),
    check('bet_actions_amount_nonnegative_ck', sql`${table.amount} >= 0`),
    check('bet_actions_seq_positive_ck', sql`${table.seq} > 0`),
  ],
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
    delta: bigint('delta', { mode: 'number' }).notNull(),
    reason: chipReason('reason').notNull(),
    refActionId: uuid('ref_action_id').references(() => betActions.id),
    /** buy_in/correction 원장의 근거 바이인 행. 기존 데이터 호환을 위해 nullable. */
    refBuyInId: uuid('ref_buy_in_id').references((): AnyPgColumn => buyIns.id),
    /** 정정 행이 원본을 가리킨다. 원본은 수정하지 않는다. */
    revertedOf: uuid('reverted_of').references((): AnyPgColumn => chipLedger.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('chip_ledger_room_user_idx').on(table.roomId, table.userId),
    index('chip_ledger_room_time_idx').on(table.roomId, table.createdAt),
    /** 판별 팟 계산(getRoundPot: roundId + reason 필터)용. */
    index('chip_ledger_round_reason_idx').on(table.roundId, table.reason),
    index('chip_ledger_ref_buy_in_idx').on(table.refBuyInId),
    uniqueIndex('chip_ledger_reverted_of_uq')
      .on(table.revertedOf)
      .where(sql`${table.revertedOf} is not null`),
    check('chip_ledger_delta_nonzero_ck', sql`${table.delta} <> 0`),
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
    /** 바이인 취소 행이 원본 바이인을 가리킨다. */
    revertedOf: uuid('reverted_of').references((): AnyPgColumn => buyIns.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('buy_ins_room_user_idx').on(table.roomId, table.userId),
    uniqueIndex('buy_ins_reverted_of_uq')
      .on(table.revertedOf)
      .where(sql`${table.revertedOf} is not null`),
    check('buy_ins_amount_nonzero_ck', sql`${table.amount} <> 0`),
  ],
)
