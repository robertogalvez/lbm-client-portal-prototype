ALTER TABLE video_cache
  ADD COLUMN IF NOT EXISTS assigned_am_name text,
  ADD COLUMN IF NOT EXISTS editor_name text,
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS quality_check varchar(50),
  ADD COLUMN IF NOT EXISTS date_updated text,
  ADD COLUMN IF NOT EXISTS due_date text;
