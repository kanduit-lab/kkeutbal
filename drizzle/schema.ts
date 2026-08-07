import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  foreignKey,
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
export const creditAccountKind = pgEnum('credit_account_kind', ['user', 'issuance'])
export const creditTransactionKind = pgEnum('credit_transaction_kind', [
  'admin_grant',
  'admin_revoke',
  'room_lock',
  'room_settlement',
  'correction',
])
export const visionProvider = pgEnum('vision_provider', ['anthropic', 'gemini'])

/**
 * `deleted`는 소프트 삭제다. `users.id`를 `rooms.host_id`, 판 기록,
 * `credit_transactions.initiated_by`가 참조해서 행을 지우면 지난 판 승패와 원장이 끊긴다.
 */
export const userStatus = pgEnum('user_status', ['active', 'suspended', 'deleted'])

export const fairRoundPhase = pgEnum('fair_round_phase', [
  'collecting_seeds',
  'sealed',
  'revealed',
  'aborted',
])

const MAX_SAFE_INTEGER = 9_007_199_254_740_991

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authentikSub: text('authentik_sub').notNull().unique(),
    username: text('username').unique(),
    passwordHash: text('password_hash'),
    phone: text('phone').unique(),
    displayName: text('display_name').notNull(),
    avatarUrl: text('avatar_url'),
    isAdmin: boolean('is_admin').notNull().default(false),
    isManaged: boolean('is_managed').notNull().default(false),
    status: userStatus('status').notNull().default('active'),
    statusReason: text('status_reason'),
    statusChangedAt: timestamp('status_changed_at', { withTimezone: true }),
    statusChangedBy: uuid('status_changed_by').references((): AnyPgColumn => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('users_status_created_idx').on(table.status, table.createdAt),
    // 정지된 계정이 관리자 권한을 들고 있으면 로그인만 막히고 권한은 살아 있는 상태가 된다.
    check(
      'users_admin_must_be_active_ck',
      sql`${table.isAdmin} = false or ${table.status} = 'active'`,
    ),
    check(
      'users_status_change_stamped_ck',
      sql`${table.status} = 'active' or ${table.statusChangedAt} is not null`,
    ),
  ],
)

export const creditAccounts = pgTable(
  'credit_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id),
    kind: creditAccountKind('kind').notNull(),
    availableBalance: bigint('available_balance', { mode: 'number' }).notNull().default(0),
    lockedBalance: bigint('locked_balance', { mode: 'number' }).notNull().default(0),
    version: bigint('version', { mode: 'number' }).notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('credit_accounts_user_uq')
      .on(table.userId)
      .where(sql`${table.userId} is not null`),
    uniqueIndex('credit_accounts_issuance_uq')
      .on(table.kind)
      .where(sql`${table.kind} = 'issuance'`),
    check('credit_accounts_version_nonnegative_ck', sql`${table.version} >= 0`),
    check(
      'credit_accounts_owner_kind_ck',
      sql`(${table.kind} = 'user' and ${table.userId} is not null) or (${table.kind} = 'issuance' and ${table.userId} is null)`,
    ),
    check(
      'credit_accounts_user_balance_nonnegative_ck',
      sql`${table.kind} <> 'user' or (${table.availableBalance} >= 0 and ${table.lockedBalance} >= 0)`,
    ),
    check(
      'credit_accounts_number_safe_ck',
      sql`${table.availableBalance} between ${-MAX_SAFE_INTEGER} and ${MAX_SAFE_INTEGER}
        and ${table.lockedBalance} between ${-MAX_SAFE_INTEGER} and ${MAX_SAFE_INTEGER}`,
    ),
  ],
)

export const authSettings = pgTable('auth_settings', {
  id: text('id').primaryKey().default('default'),
  ssoEnabled: boolean('sso_enabled').notNull().default(false),
  ssoIssuer: text('sso_issuer'),
  ssoClientId: text('sso_client_id'),
  ssoClientSecretCiphertext: text('sso_client_secret_ciphertext'),
  initialAdminSetupCiphertext: text('initial_admin_setup_ciphertext'),
  initialAdminSetupExpiresAt: timestamp('initial_admin_setup_expires_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const visionSettings = pgTable(
  'vision_settings',
  {
    id: text('id').primaryKey().default('default'),
    enabled: boolean('enabled').notNull().default(false),
    provider: visionProvider('provider').notNull().default('anthropic'),
    model: text('model').notNull().default('claude-sonnet-5'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('vision_settings_model_present_ck', sql`length(trim(${table.model})) between 1 and 120`),
  ],
)

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

export const guestTokens = pgTable(
  'guest_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').unique(),
    codeHash: text('code_hash').unique(),
    label: text('label').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'guest_tokens_credential_present_ck',
      sql`${table.codeHash} is not null or ${table.code} is not null`,
    ),
    index('guest_tokens_created_by_idx').on(table.createdBy),
  ],
)

export const registrationCodes = pgTable(
  'registration_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    codeHash: text('code_hash').notNull().unique(),
    label: text('label').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('registration_codes_expires_at_idx').on(table.expiresAt),
    index('registration_codes_created_by_idx').on(table.createdBy),
  ],
)

export const promotions = pgTable(
  'promotions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: promotionKind('kind').notNull(),
    title: text('title').notNull(),
    body: text('body'),
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
  (table) => [
    index('promotions_kind_active_idx').on(table.kind, table.isActive),
    index('promotions_created_by_idx').on(table.createdBy),
  ],
)

export const rooms = pgTable(
  'rooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(),
    hostId: uuid('host_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    gameType: gameType('game_type').notNull(),
    status: roomStatus('status').notNull().default('waiting'),
    inputMode: inputMode('input_mode').notNull().default('trust'),
    rulePreset: jsonb('rule_preset').notNull().default({}),
    startingChips: integer('starting_chips').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (table) => [
    index('rooms_status_idx').on(table.status),
    index('rooms_host_idx').on(table.hostId),
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
    leftAt: timestamp('left_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.roomId, table.userId] }),
    unique('room_members_seat_uq').on(table.roomId, table.seatNo),
    index('room_members_user_idx').on(table.userId),
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
    seq: integer('seq').notNull(),
    status: roundStatus('status').notNull().default('playing'),
    pot: bigint('pot', { mode: 'number' }).notNull().default(0),
    winnerId: uuid('winner_id').references(() => users.id),
    result: jsonb('result'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (table) => [
    unique('rounds_room_seq_uq').on(table.roomId, table.seq),
    check('rounds_seq_positive_ck', sql`${table.seq} > 0`),
    check('rounds_pot_nonnegative_ck', sql`${table.pot} >= 0`),
    check('rounds_pot_number_safe_ck', sql`${table.pot} <= ${MAX_SAFE_INTEGER}`),
    uniqueIndex('rounds_one_playing_per_room_uq')
      .on(table.roomId)
      .where(sql`${table.status} = 'playing'`),
    index('rounds_winner_idx').on(table.winnerId),
  ],
)

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

export const roundFairness = pgTable(
  'round_fairness',
  {
    roundId: uuid('round_id')
      .primaryKey()
      .references(() => rounds.id, { onDelete: 'cascade' }),
    algorithmVersion: text('algorithm_version').notNull(),
    receiptVersion: text('receipt_version').notNull(),
    phase: fairRoundPhase('phase').notNull().default('collecting_seeds'),
    serverSeedCiphertext: text('server_seed_ciphertext').notNull(),
    serverSeedCommitment: text('server_seed_commitment').notNull(),
    seedDeadline: timestamp('seed_deadline', { withTimezone: true }).notNull(),
    seedCollectionSealedAt: timestamp('seed_collection_sealed_at', { withTimezone: true }),
    shuffledDeckCommitment: text('shuffled_deck_commitment'),
    publicReceipt: jsonb('public_receipt'),
    revealedAt: timestamp('revealed_at', { withTimezone: true }),
    abortedAt: timestamp('aborted_at', { withTimezone: true }),
    abortReason: text('abort_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('round_fairness_phase_deadline_idx').on(table.phase, table.seedDeadline),
    check(
      'round_fairness_algorithm_version_present_ck',
      sql`length(trim(${table.algorithmVersion})) between 1 and 120`,
    ),
    check(
      'round_fairness_receipt_version_present_ck',
      sql`length(trim(${table.receiptVersion})) between 1 and 120`,
    ),
    check(
      'round_fairness_server_seed_ciphertext_present_ck',
      sql`length(trim(${table.serverSeedCiphertext})) > 0`,
    ),
    check(
      'round_fairness_server_seed_commitment_hash_ck',
      sql`${table.serverSeedCommitment} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'round_fairness_sealed_deck_commitment_hash_ck',
      sql`${table.shuffledDeckCommitment} is null or ${table.shuffledDeckCommitment} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'round_fairness_public_receipt_object_ck',
      sql`${table.publicReceipt} is null or jsonb_typeof(${table.publicReceipt}) = 'object'`,
    ),
    check(
      'round_fairness_phase_shape_ck',
      sql`(
        ${table.phase} = 'collecting_seeds'
        and ${table.seedCollectionSealedAt} is null
        and ${table.shuffledDeckCommitment} is null
        and ${table.publicReceipt} is null
        and ${table.revealedAt} is null
        and ${table.abortedAt} is null
        and ${table.abortReason} is null
      ) or (
        ${table.phase} = 'sealed'
        and ${table.seedCollectionSealedAt} is not null
        and ${table.shuffledDeckCommitment} is not null
        and ${table.publicReceipt} is not null
        and ${table.revealedAt} is null
        and ${table.abortedAt} is null
        and ${table.abortReason} is null
      ) or (
        ${table.phase} = 'revealed'
        and ${table.seedCollectionSealedAt} is not null
        and ${table.shuffledDeckCommitment} is not null
        and ${table.publicReceipt} is not null
        and ${table.revealedAt} is not null
        and ${table.abortedAt} is null
        and ${table.abortReason} is null
      ) or (
        ${table.phase} = 'aborted'
        and ${table.seedCollectionSealedAt} is null
        and ${table.shuffledDeckCommitment} is null
        and ${table.publicReceipt} is null
        and ${table.revealedAt} is null
        and ${table.abortedAt} is not null
        and length(trim(${table.abortReason})) between 1 and 200
      )`,
    ),
  ],
)

export const roundFairnessParticipants = pgTable(
  'round_fairness_participants',
  {
    roundId: uuid('round_id')
      .notNull()
      .references(() => roundFairness.roundId, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    dealOrder: integer('deal_order').notNull(),
    clientSeedHash: text('client_seed_hash'),
    seedSubmittedAt: timestamp('seed_submitted_at', { withTimezone: true }),
    seedTimedOutAt: timestamp('seed_timed_out_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.roundId, table.userId] }),
    unique('round_fairness_participants_deal_order_uq').on(table.roundId, table.dealOrder),
    index('round_fairness_participants_user_idx').on(table.userId),
    foreignKey({
      columns: [table.roundId, table.userId],
      foreignColumns: [roundParticipants.roundId, roundParticipants.userId],
      name: 'round_fairness_participants_round_participant_fk',
    }).onDelete('cascade'),
    check('round_fairness_participants_deal_order_nonnegative_ck', sql`${table.dealOrder} >= 0`),
    check(
      'round_fairness_participants_seed_submission_shape_ck',
      sql`(
        ${table.clientSeedHash} is null and ${table.seedSubmittedAt} is null
      ) or (
        ${table.clientSeedHash} ~ '^[0-9a-f]{64}$' and ${table.seedSubmittedAt} is not null
      )`,
    ),
    check(
      'round_fairness_participants_seed_terminal_exclusive_ck',
      sql`not (${table.seedSubmittedAt} is not null and ${table.seedTimedOutAt} is not null)`,
    ),
  ],
)

export const roundFairnessReveals = pgTable(
  'round_fairness_reveals',
  {
    roundId: uuid('round_id')
      .primaryKey()
      .references(() => roundFairness.roundId, { onDelete: 'cascade' }),
    serverSeed: text('server_seed').notNull(),
    fullReceipt: jsonb('full_receipt').notNull(),
    revealedBy: uuid('revealed_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'round_fairness_reveals_server_seed_hash_ck',
      sql`${table.serverSeed} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'round_fairness_reveals_full_receipt_object_ck',
      sql`jsonb_typeof(${table.fullReceipt}) = 'object'`,
    ),
  ],
)

export const creditTransactions = pgTable(
  'credit_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: creditTransactionKind('kind').notNull(),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    roomId: uuid('room_id').references(() => rooms.id),
    roundId: uuid('round_id').references(() => rounds.id),
    initiatedBy: uuid('initiated_by').references(() => users.id),
    reversesTransactionId: uuid('reverses_transaction_id').references(
      (): AnyPgColumn => creditTransactions.id,
    ),
    reason: text('reason').notNull(),
    snapshot: jsonb('snapshot').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('credit_transactions_room_time_idx').on(table.roomId, table.createdAt),
    index('credit_transactions_round_time_idx').on(table.roundId, table.createdAt),
    index('credit_transactions_initiator_time_idx').on(table.initiatedBy, table.createdAt),
    uniqueIndex('credit_transactions_reverses_uq')
      .on(table.reversesTransactionId)
      .where(sql`${table.reversesTransactionId} is not null`),
    check(
      'credit_transactions_reason_present_ck',
      sql`length(trim(${table.reason})) between 1 and 200`,
    ),
  ],
)

export const creditEntries = pgTable(
  'credit_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => creditTransactions.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => creditAccounts.id),
    deltaAvailable: bigint('delta_available', { mode: 'number' }).notNull(),
    deltaLocked: bigint('delta_locked', { mode: 'number' }).notNull(),
    availableAfter: bigint('available_after', { mode: 'number' }).notNull(),
    lockedAfter: bigint('locked_after', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('credit_entries_account_time_idx').on(table.accountId, table.createdAt),
    index('credit_entries_transaction_idx').on(table.transactionId),
    check(
      'credit_entries_delta_nonzero_ck',
      sql`${table.deltaAvailable} <> 0 or ${table.deltaLocked} <> 0`,
    ),
    check(
      'credit_entries_number_safe_ck',
      sql`${table.deltaAvailable} between ${-MAX_SAFE_INTEGER} and ${MAX_SAFE_INTEGER}
        and ${table.deltaLocked} between ${-MAX_SAFE_INTEGER} and ${MAX_SAFE_INTEGER}
        and ${table.availableAfter} between ${-MAX_SAFE_INTEGER} and ${MAX_SAFE_INTEGER}
        and ${table.lockedAfter} between ${-MAX_SAFE_INTEGER} and ${MAX_SAFE_INTEGER}`,
    ),
  ],
)

export const betActions = pgTable(
  'bet_actions',
  {
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
    enteredBy: uuid('entered_by').references(() => users.id),
    action: betAction('action').notNull(),
    amount: integer('amount').notNull().default(0),
    status: actionStatus('status').notNull().default('pending'),
    approvedBy: uuid('approved_by').references(() => users.id),
    reason: text('reason'),
    seq: integer('seq').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('bet_actions_round_seq_uq').on(table.roundId, table.seq),
    index('bet_actions_room_idx').on(table.roomId),
    index('bet_actions_user_idx').on(table.userId),
    index('bet_actions_entered_by_idx').on(table.enteredBy),
    index('bet_actions_approved_by_idx').on(table.approvedBy),
    check('bet_actions_amount_nonnegative_ck', sql`${table.amount} >= 0`),
    check('bet_actions_seq_positive_ck', sql`${table.seq} > 0`),
  ],
)

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
    delta: bigint('delta', { mode: 'number' }).notNull(),
    reason: chipReason('reason').notNull(),
    refActionId: uuid('ref_action_id').references(() => betActions.id),
    refBuyInId: uuid('ref_buy_in_id').references((): AnyPgColumn => buyIns.id),
    revertedOf: uuid('reverted_of').references((): AnyPgColumn => chipLedger.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('chip_ledger_room_user_idx').on(table.roomId, table.userId),
    index('chip_ledger_room_time_idx').on(table.roomId, table.createdAt),
    index('chip_ledger_round_reason_idx').on(table.roundId, table.reason),
    index('chip_ledger_ref_buy_in_idx').on(table.refBuyInId),
    index('chip_ledger_user_idx').on(table.userId),
    index('chip_ledger_ref_action_idx').on(table.refActionId),
    uniqueIndex('chip_ledger_reverted_of_uq')
      .on(table.revertedOf)
      .where(sql`${table.revertedOf} is not null`),
    check('chip_ledger_delta_nonzero_ck', sql`${table.delta} <> 0`),
    check(
      'chip_ledger_delta_number_safe_ck',
      sql`${table.delta} between ${-MAX_SAFE_INTEGER} and ${MAX_SAFE_INTEGER}`,
    ),
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
    revertedOf: uuid('reverted_of').references((): AnyPgColumn => buyIns.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('buy_ins_room_user_idx').on(table.roomId, table.userId),
    index('buy_ins_user_idx').on(table.userId),
    index('buy_ins_created_by_idx').on(table.createdBy),
    uniqueIndex('buy_ins_reverted_of_uq')
      .on(table.revertedOf)
      .where(sql`${table.revertedOf} is not null`),
    check('buy_ins_amount_nonzero_ck', sql`${table.amount} <> 0`),
    check(
      'buy_ins_amount_number_safe_ck',
      sql`${table.amount} between ${-MAX_SAFE_INTEGER} and ${MAX_SAFE_INTEGER}`,
    ),
  ],
)

export const roomCreditLocks = pgTable(
  'room_credit_locks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    buyInId: uuid('buy_in_id')
      .notNull()
      .references(() => buyIns.id),
    lockTransactionId: uuid('lock_transaction_id')
      .notNull()
      .references(() => creditTransactions.id),
    releasedTransactionId: uuid('released_transaction_id').references(() => creditTransactions.id),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('room_credit_locks_buy_in_uq').on(table.buyInId),
    index('room_credit_locks_released_transaction_idx').on(table.releasedTransactionId),
    index('room_credit_locks_room_user_idx').on(table.roomId, table.userId),
    index('room_credit_locks_user_idx').on(table.userId),
    index('room_credit_locks_lock_transaction_idx').on(table.lockTransactionId),
    check('room_credit_locks_amount_positive_ck', sql`${table.amount} > 0`),
    check('room_credit_locks_amount_number_safe_ck', sql`${table.amount} <= ${MAX_SAFE_INTEGER}`),
  ],
)
