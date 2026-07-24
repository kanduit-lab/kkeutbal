CREATE TYPE "public"."credit_account_kind" AS ENUM('user', 'issuance');--> statement-breakpoint
CREATE TYPE "public"."credit_transaction_kind" AS ENUM('admin_grant', 'admin_revoke', 'room_lock', 'room_settlement', 'correction');--> statement-breakpoint
CREATE TABLE "credit_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"kind" "credit_account_kind" NOT NULL,
	"available_balance" bigint DEFAULT 0 NOT NULL,
	"locked_balance" bigint DEFAULT 0 NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_accounts_version_nonnegative_ck" CHECK ("credit_accounts"."version" >= 0),
	CONSTRAINT "credit_accounts_owner_kind_ck" CHECK (("credit_accounts"."kind" = 'user' and "credit_accounts"."user_id" is not null) or ("credit_accounts"."kind" = 'issuance' and "credit_accounts"."user_id" is null)),
	CONSTRAINT "credit_accounts_user_balance_nonnegative_ck" CHECK ("credit_accounts"."kind" <> 'user' or ("credit_accounts"."available_balance" >= 0 and "credit_accounts"."locked_balance" >= 0))
);
--> statement-breakpoint
CREATE TABLE "credit_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"delta_available" bigint NOT NULL,
	"delta_locked" bigint NOT NULL,
	"available_after" bigint NOT NULL,
	"locked_after" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_entries_delta_nonzero_ck" CHECK ("credit_entries"."delta_available" <> 0 or "credit_entries"."delta_locked" <> 0)
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "credit_transaction_kind" NOT NULL,
	"idempotency_key" text NOT NULL,
	"room_id" uuid,
	"round_id" uuid,
	"initiated_by" uuid,
	"reverses_transaction_id" uuid,
	"reason" text NOT NULL,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_transactions_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "credit_transactions_reason_present_ck" CHECK (length(trim("credit_transactions"."reason")) between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "room_credit_locks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"buy_in_id" uuid NOT NULL,
	"lock_transaction_id" uuid NOT NULL,
	"released_transaction_id" uuid,
	"amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_credit_locks_buy_in_uq" UNIQUE("buy_in_id"),
	CONSTRAINT "room_credit_locks_amount_positive_ck" CHECK ("room_credit_locks"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_transaction_id_credit_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."credit_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_account_id_credit_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."credit_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_initiated_by_users_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_reverses_transaction_id_credit_transactions_id_fk" FOREIGN KEY ("reverses_transaction_id") REFERENCES "public"."credit_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_credit_locks" ADD CONSTRAINT "room_credit_locks_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_credit_locks" ADD CONSTRAINT "room_credit_locks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_credit_locks" ADD CONSTRAINT "room_credit_locks_buy_in_id_buy_ins_id_fk" FOREIGN KEY ("buy_in_id") REFERENCES "public"."buy_ins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_credit_locks" ADD CONSTRAINT "room_credit_locks_lock_transaction_id_credit_transactions_id_fk" FOREIGN KEY ("lock_transaction_id") REFERENCES "public"."credit_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_credit_locks" ADD CONSTRAINT "room_credit_locks_released_transaction_id_credit_transactions_id_fk" FOREIGN KEY ("released_transaction_id") REFERENCES "public"."credit_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_accounts_user_uq" ON "credit_accounts" USING btree ("user_id") WHERE "credit_accounts"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_accounts_issuance_uq" ON "credit_accounts" USING btree ("kind") WHERE "credit_accounts"."kind" = 'issuance';--> statement-breakpoint
CREATE INDEX "credit_entries_account_time_idx" ON "credit_entries" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "credit_entries_transaction_idx" ON "credit_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "credit_transactions_room_time_idx" ON "credit_transactions" USING btree ("room_id","created_at");--> statement-breakpoint
CREATE INDEX "credit_transactions_initiator_time_idx" ON "credit_transactions" USING btree ("initiated_by","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_transactions_reverses_uq" ON "credit_transactions" USING btree ("reverses_transaction_id") WHERE "credit_transactions"."reverses_transaction_id" is not null;--> statement-breakpoint
CREATE INDEX "room_credit_locks_released_transaction_idx" ON "room_credit_locks" USING btree ("released_transaction_id");--> statement-breakpoint
CREATE INDEX "room_credit_locks_room_user_idx" ON "room_credit_locks" USING btree ("room_id","user_id");