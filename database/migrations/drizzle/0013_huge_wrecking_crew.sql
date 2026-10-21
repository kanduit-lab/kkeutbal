CREATE INDEX "bet_actions_room_idx" ON "bet_actions" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "bet_actions_user_idx" ON "bet_actions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bet_actions_entered_by_idx" ON "bet_actions" USING btree ("entered_by");--> statement-breakpoint
CREATE INDEX "bet_actions_approved_by_idx" ON "bet_actions" USING btree ("approved_by");--> statement-breakpoint
CREATE INDEX "buy_ins_user_idx" ON "buy_ins" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "buy_ins_created_by_idx" ON "buy_ins" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "chip_ledger_user_idx" ON "chip_ledger" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chip_ledger_ref_action_idx" ON "chip_ledger" USING btree ("ref_action_id");--> statement-breakpoint
CREATE INDEX "guest_tokens_created_by_idx" ON "guest_tokens" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "promotions_created_by_idx" ON "promotions" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "registration_codes_created_by_idx" ON "registration_codes" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "room_members_user_idx" ON "room_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rooms_host_idx" ON "rooms" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "rounds_winner_idx" ON "rounds" USING btree ("winner_id");