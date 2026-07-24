CREATE TYPE "public"."fair_round_phase" AS ENUM('collecting_seeds', 'sealed', 'revealed', 'aborted');--> statement-breakpoint
CREATE TABLE "round_fairness" (
	"round_id" uuid PRIMARY KEY NOT NULL,
	"algorithm_version" text NOT NULL,
	"receipt_version" text NOT NULL,
	"phase" "fair_round_phase" DEFAULT 'collecting_seeds' NOT NULL,
	"server_seed_ciphertext" text NOT NULL,
	"server_seed_commitment" text NOT NULL,
	"seed_deadline" timestamp with time zone NOT NULL,
	"seed_collection_sealed_at" timestamp with time zone,
	"shuffled_deck_commitment" text,
	"public_receipt" jsonb,
	"revealed_at" timestamp with time zone,
	"aborted_at" timestamp with time zone,
	"abort_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "round_fairness_algorithm_version_present_ck" CHECK (length(trim("round_fairness"."algorithm_version")) between 1 and 120),
	CONSTRAINT "round_fairness_receipt_version_present_ck" CHECK (length(trim("round_fairness"."receipt_version")) between 1 and 120),
	CONSTRAINT "round_fairness_server_seed_ciphertext_present_ck" CHECK (length(trim("round_fairness"."server_seed_ciphertext")) > 0),
	CONSTRAINT "round_fairness_server_seed_commitment_hash_ck" CHECK ("round_fairness"."server_seed_commitment" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "round_fairness_sealed_deck_commitment_hash_ck" CHECK ("round_fairness"."shuffled_deck_commitment" is null or "round_fairness"."shuffled_deck_commitment" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "round_fairness_public_receipt_object_ck" CHECK ("round_fairness"."public_receipt" is null or jsonb_typeof("round_fairness"."public_receipt") = 'object'),
	CONSTRAINT "round_fairness_phase_shape_ck" CHECK ((
        "round_fairness"."phase" = 'collecting_seeds'
        and "round_fairness"."seed_collection_sealed_at" is null
        and "round_fairness"."shuffled_deck_commitment" is null
        and "round_fairness"."public_receipt" is null
        and "round_fairness"."revealed_at" is null
        and "round_fairness"."aborted_at" is null
        and "round_fairness"."abort_reason" is null
      ) or (
        "round_fairness"."phase" = 'sealed'
        and "round_fairness"."seed_collection_sealed_at" is not null
        and "round_fairness"."shuffled_deck_commitment" is not null
        and "round_fairness"."public_receipt" is not null
        and "round_fairness"."revealed_at" is null
        and "round_fairness"."aborted_at" is null
        and "round_fairness"."abort_reason" is null
      ) or (
        "round_fairness"."phase" = 'revealed'
        and "round_fairness"."seed_collection_sealed_at" is not null
        and "round_fairness"."shuffled_deck_commitment" is not null
        and "round_fairness"."public_receipt" is not null
        and "round_fairness"."revealed_at" is not null
        and "round_fairness"."aborted_at" is null
        and "round_fairness"."abort_reason" is null
      ) or (
        "round_fairness"."phase" = 'aborted'
        and "round_fairness"."seed_collection_sealed_at" is null
        and "round_fairness"."shuffled_deck_commitment" is null
        and "round_fairness"."public_receipt" is null
        and "round_fairness"."revealed_at" is null
        and "round_fairness"."aborted_at" is not null
        and length(trim("round_fairness"."abort_reason")) between 1 and 200
      ))
);
--> statement-breakpoint
CREATE TABLE "round_fairness_participants" (
	"round_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"deal_order" integer NOT NULL,
	"client_seed_hash" text,
	"seed_submitted_at" timestamp with time zone,
	"seed_timed_out_at" timestamp with time zone,
	CONSTRAINT "round_fairness_participants_round_id_user_id_pk" PRIMARY KEY("round_id","user_id"),
	CONSTRAINT "round_fairness_participants_deal_order_uq" UNIQUE("round_id","deal_order"),
	CONSTRAINT "round_fairness_participants_deal_order_nonnegative_ck" CHECK ("round_fairness_participants"."deal_order" >= 0),
	CONSTRAINT "round_fairness_participants_seed_submission_shape_ck" CHECK ((
        "round_fairness_participants"."client_seed_hash" is null and "round_fairness_participants"."seed_submitted_at" is null
      ) or (
        "round_fairness_participants"."client_seed_hash" ~ '^[0-9a-f]{64}$' and "round_fairness_participants"."seed_submitted_at" is not null
      )),
	CONSTRAINT "round_fairness_participants_seed_terminal_exclusive_ck" CHECK (not ("round_fairness_participants"."seed_submitted_at" is not null and "round_fairness_participants"."seed_timed_out_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "round_fairness_reveals" (
	"round_id" uuid PRIMARY KEY NOT NULL,
	"server_seed" text NOT NULL,
	"full_receipt" jsonb NOT NULL,
	"revealed_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "round_fairness_reveals_server_seed_hash_ck" CHECK ("round_fairness_reveals"."server_seed" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "round_fairness_reveals_full_receipt_object_ck" CHECK (jsonb_typeof("round_fairness_reveals"."full_receipt") = 'object')
);
--> statement-breakpoint
ALTER TABLE "round_fairness" ADD CONSTRAINT "round_fairness_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_fairness_participants" ADD CONSTRAINT "round_fairness_participants_round_id_round_fairness_round_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."round_fairness"("round_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_fairness_participants" ADD CONSTRAINT "round_fairness_participants_round_participant_fk" FOREIGN KEY ("round_id","user_id") REFERENCES "public"."round_participants"("round_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_fairness_reveals" ADD CONSTRAINT "round_fairness_reveals_round_id_round_fairness_round_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."round_fairness"("round_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_fairness_reveals" ADD CONSTRAINT "round_fairness_reveals_revealed_by_users_id_fk" FOREIGN KEY ("revealed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "round_fairness_phase_deadline_idx" ON "round_fairness" USING btree ("phase","seed_deadline");--> statement-breakpoint
CREATE INDEX "round_fairness_participants_user_idx" ON "round_fairness_participants" USING btree ("user_id");