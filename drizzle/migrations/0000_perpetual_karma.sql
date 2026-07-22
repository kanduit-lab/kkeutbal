CREATE TYPE "public"."action_status" AS ENUM('pending', 'accepted', 'rejected', 'reverted');--> statement-breakpoint
CREATE TYPE "public"."bet_action" AS ENUM('check', 'call', 'raise', 'fold', 'allin');--> statement-breakpoint
CREATE TYPE "public"."chip_reason" AS ENUM('buy_in', 'bet', 'pot_win', 'correction', 'settlement');--> statement-breakpoint
CREATE TYPE "public"."game_type" AS ENUM('seotda', 'gostop');--> statement-breakpoint
CREATE TYPE "public"."hand_source" AS ENUM('manual', 'vision');--> statement-breakpoint
CREATE TYPE "public"."input_mode" AS ENUM('trust', 'approval');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('host', 'dealer', 'player', 'observer');--> statement-breakpoint
CREATE TYPE "public"."room_status" AS ENUM('waiting', 'playing', 'settled', 'closed');--> statement-breakpoint
CREATE TYPE "public"."round_status" AS ENUM('playing', 'ended', 'voided');--> statement-breakpoint
CREATE TABLE "bet_actions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"room_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"entered_by" uuid,
	"action" "bet_action" NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"status" "action_status" DEFAULT 'pending' NOT NULL,
	"approved_by" uuid,
	"reason" text,
	"seq" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buy_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chip_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"round_id" uuid,
	"user_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" "chip_reason" NOT NULL,
	"ref_action_id" uuid,
	"reverted_of" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hand_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"cards" jsonb NOT NULL,
	"rank_label" text,
	"rank_score" integer,
	"source" "hand_source" DEFAULT 'manual' NOT NULL,
	"confidence" numeric(4, 3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hand_records_round_user_uq" UNIQUE("round_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "room_members" (
	"room_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'player' NOT NULL,
	"seat_no" integer NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "room_members_room_id_user_id_pk" PRIMARY KEY("room_id","user_id"),
	CONSTRAINT "room_members_seat_uq" UNIQUE("room_id","seat_no")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"group_id" uuid,
	"host_id" uuid NOT NULL,
	"name" text NOT NULL,
	"game_type" "game_type" NOT NULL,
	"status" "room_status" DEFAULT 'waiting' NOT NULL,
	"input_mode" "input_mode" DEFAULT 'trust' NOT NULL,
	"rule_preset" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"starting_chips" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "rooms_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"status" "round_status" DEFAULT 'playing' NOT NULL,
	"pot" integer DEFAULT 0 NOT NULL,
	"winner_id" uuid,
	"result" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "rounds_room_seq_uq" UNIQUE("room_id","seq")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"authentik_sub" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_authentik_sub_unique" UNIQUE("authentik_sub")
);
--> statement-breakpoint
ALTER TABLE "bet_actions" ADD CONSTRAINT "bet_actions_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bet_actions" ADD CONSTRAINT "bet_actions_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bet_actions" ADD CONSTRAINT "bet_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bet_actions" ADD CONSTRAINT "bet_actions_entered_by_users_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bet_actions" ADD CONSTRAINT "bet_actions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buy_ins" ADD CONSTRAINT "buy_ins_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buy_ins" ADD CONSTRAINT "buy_ins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buy_ins" ADD CONSTRAINT "buy_ins_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chip_ledger" ADD CONSTRAINT "chip_ledger_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chip_ledger" ADD CONSTRAINT "chip_ledger_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chip_ledger" ADD CONSTRAINT "chip_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chip_ledger" ADD CONSTRAINT "chip_ledger_ref_action_id_bet_actions_id_fk" FOREIGN KEY ("ref_action_id") REFERENCES "public"."bet_actions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hand_records" ADD CONSTRAINT "hand_records_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hand_records" ADD CONSTRAINT "hand_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_winner_id_users_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bet_actions_round_seq_idx" ON "bet_actions" USING btree ("round_id","seq");--> statement-breakpoint
CREATE INDEX "buy_ins_room_user_idx" ON "buy_ins" USING btree ("room_id","user_id");--> statement-breakpoint
CREATE INDEX "chip_ledger_room_user_idx" ON "chip_ledger" USING btree ("room_id","user_id");--> statement-breakpoint
CREATE INDEX "chip_ledger_room_time_idx" ON "chip_ledger" USING btree ("room_id","created_at");--> statement-breakpoint
CREATE INDEX "rooms_status_idx" ON "rooms" USING btree ("status");