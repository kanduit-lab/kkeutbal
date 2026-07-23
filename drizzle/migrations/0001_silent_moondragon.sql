ALTER TYPE "public"."game_type" ADD VALUE 'poker';--> statement-breakpoint
ALTER TABLE "group_members" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "groups" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hand_records" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "group_members" CASCADE;--> statement-breakpoint
DROP TABLE "groups" CASCADE;--> statement-breakpoint
DROP TABLE "hand_records" CASCADE;--> statement-breakpoint
ALTER TABLE "rooms" DROP CONSTRAINT "rooms_group_id_groups_id_fk";
--> statement-breakpoint
ALTER TABLE "rooms" DROP COLUMN "group_id";--> statement-breakpoint
DROP TYPE "public"."hand_source";