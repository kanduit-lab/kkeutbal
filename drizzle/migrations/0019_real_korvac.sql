ALTER TABLE "auth_settings" ADD COLUMN "initial_admin_setup_ciphertext" text;--> statement-breakpoint
ALTER TABLE "auth_settings" ADD COLUMN "initial_admin_setup_expires_at" timestamp with time zone;