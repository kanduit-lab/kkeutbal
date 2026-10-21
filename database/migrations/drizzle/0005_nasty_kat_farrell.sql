CREATE TABLE "auth_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"sso_enabled" boolean DEFAULT false NOT NULL,
	"sso_issuer" text,
	"sso_client_id" text,
	"sso_client_secret_ciphertext" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
