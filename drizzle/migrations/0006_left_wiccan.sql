-- Reconcile schema changes that were previously applied through Supabase MCP only.
-- These statements are idempotent so both the live database and a fresh database converge.
ALTER TYPE "public"."game_type" ADD VALUE IF NOT EXISTS 'poker';--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."promotion_kind" AS ENUM('banner', 'popup');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "promotion_kind" NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link_url" text,
	"link_label" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"priority" integer DEFAULT 0 NOT NULL,
	"dismiss_hours" integer DEFAULT 24 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotions_created_by_users_id_fk"
		FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
		ON DELETE no action ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promotions_kind_active_idx"
	ON "promotions" USING btree ("kind","is_active");--> statement-breakpoint
ALTER TABLE "promotions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"scope" text NOT NULL,
	"key_hash" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"hits" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limit_buckets_scope_key_hash_pk" PRIMARY KEY("scope","key_hash")
);
--> statement-breakpoint
ALTER TABLE "rate_limit_buckets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX "bet_actions_round_seq_idx";--> statement-breakpoint
CREATE INDEX "rate_limit_buckets_expires_at_idx" ON "rate_limit_buckets" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bet_actions_round_seq_uq" ON "bet_actions" USING btree ("round_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "chip_ledger_reverted_of_uq" ON "chip_ledger" USING btree ("reverted_of") WHERE "chip_ledger"."reverted_of" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "rounds_one_playing_per_room_uq" ON "rounds" USING btree ("room_id") WHERE "rounds"."status" = 'playing';
