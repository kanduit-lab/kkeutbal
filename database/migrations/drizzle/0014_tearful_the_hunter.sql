ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_number_safe_ck" CHECK ("credit_accounts"."available_balance" between -9007199254740991 and 9007199254740991
        and "credit_accounts"."locked_balance" between -9007199254740991 and 9007199254740991);--> statement-breakpoint
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_number_safe_ck" CHECK ("credit_entries"."delta_available" between -9007199254740991 and 9007199254740991
        and "credit_entries"."delta_locked" between -9007199254740991 and 9007199254740991
        and "credit_entries"."available_after" between -9007199254740991 and 9007199254740991
        and "credit_entries"."locked_after" between -9007199254740991 and 9007199254740991);--> statement-breakpoint
ALTER TABLE "room_credit_locks" ADD CONSTRAINT "room_credit_locks_amount_number_safe_ck" CHECK ("room_credit_locks"."amount" <= 9007199254740991);
