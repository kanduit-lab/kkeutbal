ALTER TABLE "buy_ins" ADD COLUMN "reverted_of" uuid;--> statement-breakpoint
ALTER TABLE "chip_ledger" ADD COLUMN "ref_buy_in_id" uuid;--> statement-breakpoint
-- The production append-only trigger intentionally blocks UPDATE. This migration only fills
-- a new reference column on existing rows; keep the exception scoped to this transaction.
ALTER TABLE "chip_ledger" DISABLE TRIGGER "chip_ledger_no_update";--> statement-breakpoint
-- Pair legacy buy-in rows with their ledger counterparts deterministically. Buy-in ledger
-- entries never have a round/action reference, which separates them from bet/round corrections.
WITH ranked_buy_ins AS (
	SELECT
		"id",
		"room_id",
		"user_id",
		"amount",
		row_number() OVER (
			PARTITION BY "room_id", "user_id", "amount"
			ORDER BY "created_at", "id"
		) AS occurrence
	FROM "buy_ins"
),
ranked_ledger AS (
	SELECT
		"id",
		"room_id",
		"user_id",
		"delta",
		row_number() OVER (
			PARTITION BY "room_id", "user_id", "delta"
			ORDER BY "created_at", "id"
		) AS occurrence
	FROM "chip_ledger"
	WHERE "round_id" IS NULL
	  AND "ref_action_id" IS NULL
	  AND "reason" IN ('buy_in', 'correction')
)
UPDATE "chip_ledger" ledger
SET "ref_buy_in_id" = buy_in."id"
FROM ranked_ledger candidate
INNER JOIN ranked_buy_ins buy_in
	ON buy_in."room_id" = candidate."room_id"
	AND buy_in."user_id" = candidate."user_id"
	AND buy_in."amount" = candidate."delta"
	AND buy_in.occurrence = candidate.occurrence
WHERE ledger."id" = candidate."id";--> statement-breakpoint
-- Recover the original buy-in link for legacy undo rows through the already recorded ledger
-- correction relationship.
UPDATE "buy_ins" reversal
SET "reverted_of" = original_buy_in."id"
FROM "chip_ledger" reversal_ledger
INNER JOIN "chip_ledger" original_ledger
	ON original_ledger."id" = reversal_ledger."reverted_of"
INNER JOIN "buy_ins" original_buy_in
	ON original_buy_in."id" = original_ledger."ref_buy_in_id"
WHERE reversal_ledger."ref_buy_in_id" = reversal."id"
  AND reversal."amount" < 0;--> statement-breakpoint
ALTER TABLE "chip_ledger" ENABLE TRIGGER "chip_ledger_no_update";--> statement-breakpoint
ALTER TABLE "buy_ins" ADD CONSTRAINT "buy_ins_reverted_of_buy_ins_id_fk" FOREIGN KEY ("reverted_of") REFERENCES "public"."buy_ins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chip_ledger" ADD CONSTRAINT "chip_ledger_ref_buy_in_id_buy_ins_id_fk" FOREIGN KEY ("ref_buy_in_id") REFERENCES "public"."buy_ins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chip_ledger" ADD CONSTRAINT "chip_ledger_reverted_of_chip_ledger_id_fk" FOREIGN KEY ("reverted_of") REFERENCES "public"."chip_ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "buy_ins_reverted_of_uq" ON "buy_ins" USING btree ("reverted_of") WHERE "buy_ins"."reverted_of" is not null;--> statement-breakpoint
CREATE INDEX "chip_ledger_ref_buy_in_idx" ON "chip_ledger" USING btree ("ref_buy_in_id");
