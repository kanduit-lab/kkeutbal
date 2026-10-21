CREATE INDEX "credit_transactions_round_time_idx" ON "credit_transactions" USING btree ("round_id","created_at");--> statement-breakpoint
CREATE INDEX "room_credit_locks_user_idx" ON "room_credit_locks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "room_credit_locks_lock_transaction_idx" ON "room_credit_locks" USING btree ("lock_transaction_id");