ALTER TABLE "oauth_tokens" ADD COLUMN IF NOT EXISTS "realm_id" varchar(64);
