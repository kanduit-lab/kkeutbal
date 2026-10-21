CREATE TABLE "room_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "room_connections" ADD CONSTRAINT "room_connections_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_connections" ADD CONSTRAINT "room_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_connections_room_expiry_idx" ON "room_connections" USING btree ("room_id","expires_at");--> statement-breakpoint
CREATE INDEX "room_connections_user_idx" ON "room_connections" USING btree ("user_id");--> statement-breakpoint
COMMENT ON TABLE "room_connections" IS 'Entity: expiring realtime presence leases owned by authenticated room connections';--> statement-breakpoint
REVOKE ALL ON TABLE "room_connections" FROM PUBLIC;
