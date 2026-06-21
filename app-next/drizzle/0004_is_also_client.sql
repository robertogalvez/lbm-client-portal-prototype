ALTER TABLE "auth_user" ADD COLUMN IF NOT EXISTS is_also_client boolean DEFAULT false;
