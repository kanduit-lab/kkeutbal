CREATE TABLE "registration_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"label" text NOT NULL,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registration_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
ALTER TABLE "registration_codes" ADD CONSTRAINT "registration_codes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "registration_codes_expires_at_idx" ON "registration_codes" USING btree ("expires_at");