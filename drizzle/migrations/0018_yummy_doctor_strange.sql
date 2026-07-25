CREATE TYPE "public"."vision_provider" AS ENUM('anthropic', 'gemini');--> statement-breakpoint
CREATE TABLE "vision_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"provider" "vision_provider" DEFAULT 'anthropic' NOT NULL,
	"model" text DEFAULT 'claude-sonnet-5' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vision_settings_model_present_ck" CHECK (length(trim("vision_settings"."model")) between 1 and 120)
);
