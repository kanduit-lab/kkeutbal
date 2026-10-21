ALTER TABLE "bet_actions" ADD CONSTRAINT "bet_actions_amount_nonnegative_ck" CHECK ("bet_actions"."amount" >= 0);--> statement-breakpoint
ALTER TABLE "bet_actions" ADD CONSTRAINT "bet_actions_seq_positive_ck" CHECK ("bet_actions"."seq" > 0);--> statement-breakpoint
ALTER TABLE "buy_ins" ADD CONSTRAINT "buy_ins_amount_nonzero_ck" CHECK ("buy_ins"."amount" <> 0);--> statement-breakpoint
ALTER TABLE "chip_ledger" ADD CONSTRAINT "chip_ledger_delta_nonzero_ck" CHECK ("chip_ledger"."delta" <> 0);--> statement-breakpoint
ALTER TABLE "rate_limit_buckets" ADD CONSTRAINT "rate_limit_buckets_hits_positive_ck" CHECK ("rate_limit_buckets"."hits" > 0);--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_seat_nonnegative_ck" CHECK ("room_members"."seat_no" >= 0);--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_starting_chips_positive_ck" CHECK ("rooms"."starting_chips" > 0);--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_seq_positive_ck" CHECK ("rounds"."seq" > 0);--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_pot_nonnegative_ck" CHECK ("rounds"."pot" >= 0);