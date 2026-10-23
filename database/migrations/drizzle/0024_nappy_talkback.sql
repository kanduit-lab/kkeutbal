CREATE TABLE "round_hand_choices" (
	"round_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"card_ids" text[] NOT NULL,
	"chosen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "round_hand_choices_round_id_user_id_pk" PRIMARY KEY("round_id","user_id"),
	CONSTRAINT "round_hand_choices_two_distinct_cards_ck" CHECK (cardinality("round_hand_choices"."card_ids") = 2 and "round_hand_choices"."card_ids"[1] <> "round_hand_choices"."card_ids"[2])
);
--> statement-breakpoint
ALTER TABLE "bet_actions" ADD COLUMN "street" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "street" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "choose_deadline" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "round_hand_choices" ADD CONSTRAINT "round_hand_choices_round_participant_fk" FOREIGN KEY ("round_id","user_id") REFERENCES "public"."round_participants"("round_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "round_hand_choices_user_idx" ON "round_hand_choices" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "bet_actions" ADD CONSTRAINT "bet_actions_street_range_ck" CHECK ("bet_actions"."street" in (1, 2));--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_street_range_ck" CHECK ("rounds"."street" in (1, 2));--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_choose_deadline_street_ck" CHECK ("rounds"."choose_deadline" is null or "rounds"."street" = 2);