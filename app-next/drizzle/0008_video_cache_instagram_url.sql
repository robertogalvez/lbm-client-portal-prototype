ALTER TABLE video_cache ADD COLUMN IF NOT EXISTS instagram_url text;
ALTER TABLE video_cache ADD COLUMN IF NOT EXISTS vistasocial_scheduled_at timestamp;
