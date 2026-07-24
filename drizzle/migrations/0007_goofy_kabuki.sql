CREATE TABLE "round_participants" (
	"round_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "round_participants_round_id_user_id_pk" PRIMARY KEY("round_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "round_participants" ADD CONSTRAINT "round_participants_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_participants" ADD CONSTRAINT "round_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "round_participants_user_idx" ON "round_participants" USING btree ("user_id");
--> statement-breakpoint
-- Best-effort backfill for rounds created before participant snapshots existed.
-- Current non-observers are inferred by membership timestamps; recorded actors and winners are
-- included even if their current role changed later.
INSERT INTO "round_participants" ("round_id", "user_id")
SELECT "round_id", "user_id"
FROM (
	SELECT r."id" AS "round_id", m."user_id"
	FROM "rounds" r
	INNER JOIN "room_members" m ON m."room_id" = r."room_id"
	WHERE m."joined_at" <= r."started_at"
	  AND (m."left_at" IS NULL OR m."left_at" >= r."started_at")
	  AND m."role" <> 'observer'
	UNION
	SELECT b."round_id", b."user_id"
	FROM "bet_actions" b
	UNION
	SELECT r."id", r."winner_id"
	FROM "rounds" r
	WHERE r."winner_id" IS NOT NULL
) inferred
ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE "round_participants" ENABLE ROW LEVEL SECURITY;
