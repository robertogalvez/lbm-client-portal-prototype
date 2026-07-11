DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'clickup_option_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'clickup_task_id') THEN
    ALTER TABLE clients RENAME COLUMN clickup_option_id TO clickup_task_id;
  END IF;
END $$;

ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_status varchar(20);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_synced_at timestamp;
ALTER TABLE clients ALTER COLUMN type DROP NOT NULL;
