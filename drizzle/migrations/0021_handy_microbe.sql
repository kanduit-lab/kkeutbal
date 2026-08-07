CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended', 'deleted');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" "user_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status_changed_by" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_status_changed_by_users_id_fk" FOREIGN KEY ("status_changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_status_created_idx" ON "users" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_admin_must_be_active_ck" CHECK ("users"."is_admin" = false or "users"."status" = 'active');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_status_change_stamped_ck" CHECK ("users"."status" = 'active' or "users"."status_changed_at" is not null);