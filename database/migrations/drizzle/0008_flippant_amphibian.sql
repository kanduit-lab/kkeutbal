-- PostgreSQL does not allow changing a column type while a view depends on it.
-- Preserve the existing security-invoker aggregate view around the bigint conversion.
DROP VIEW IF EXISTS "public"."session_standings";--> statement-breakpoint
ALTER TABLE "chip_ledger" ALTER COLUMN "delta" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "rounds" ALTER COLUMN "pot" SET DATA TYPE bigint;--> statement-breakpoint
CREATE VIEW "public"."session_standings"
WITH (security_invoker = true)
AS
SELECT
	ledger."room_id",
	ledger."user_id",
	coalesce(sum(ledger."delta"), 0) AS "balance",
	coalesce((
		SELECT sum(buy_in."amount")
		FROM "public"."buy_ins" buy_in
		WHERE buy_in."room_id" = ledger."room_id"
		  AND buy_in."user_id" = ledger."user_id"
	), 0) AS "buy_in_total",
	coalesce(sum(ledger."delta"), 0) - coalesce((
		SELECT sum(buy_in."amount")
		FROM "public"."buy_ins" buy_in
		WHERE buy_in."room_id" = ledger."room_id"
		  AND buy_in."user_id" = ledger."user_id"
	), 0) AS "net"
FROM "public"."chip_ledger" ledger
GROUP BY ledger."room_id", ledger."user_id";
