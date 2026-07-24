ALTER TABLE "guest_tokens" ALTER COLUMN "code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "guest_tokens" ADD COLUMN "code_hash" text;--> statement-breakpoint
ALTER TABLE "guest_tokens" ADD CONSTRAINT "guest_tokens_code_hash_unique" UNIQUE("code_hash");--> statement-breakpoint
ALTER TABLE "guest_tokens" ADD CONSTRAINT "guest_tokens_credential_present_ck" CHECK ("guest_tokens"."code_hash" is not null or "guest_tokens"."code" is not null);